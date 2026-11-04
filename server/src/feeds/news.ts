import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { DateTime } from 'luxon';
import { z } from 'zod';
import type { DocumentStore } from '../data/store.js';
import type { Instrument } from '../domain/model.js';
import { readResponseText } from '../world/http.js';
import { DurableFeedCache, FeedProviderError } from './cache.js';

const SIX_HOURS = 6 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const endpoint = 'https://www.alphavantage.co/query';
const articleSchema = z.object({
  title: z.string().min(1).max(1200), url: z.string().min(1).max(2048),
  source: z.string().min(1).max(240), time_published: z.string(),
  ticker_sentiment: z.array(z.object({ ticker: z.string().max(80) })).max(200).optional(),
});

export interface NewsArticle {
  id: string;
  title: string;
  source: string;
  sourceHost: string;
  publishedAt: string;
  url: string;
  relatedInstrumentIds: string[];
}

export interface NewsFeed {
  provider: 'alpha-vantage';
  timeBasis: 'real-world';
  articles: NewsArticle[];
}

function plainText(value: string, limit: number): string {
  return value.replace(/<[^>]*>/g, '').replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function articleUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')
      || isIP(host) || !host.includes('.') || /(?:^|\.)(?:localhost|local|internal|test|example|invalid)$/.test(host)) return null;
    return url;
  } catch { return null; }
}

export function parseAlphaNews(raw: unknown, instruments: Instrument[], now = new Date(), secret?: string): NewsFeed {
  const payload = z.object({ feed: z.array(z.unknown()).max(1000) }).safeParse(raw);
  if (!payload.success) throw new FeedProviderError('NEWS_INVALID_RESPONSE');
  const known = new Set(instruments.map(instrument => instrument.id));
  const seen = new Set<string>();
  const articles: NewsArticle[] = [];
  for (const item of payload.data.feed) {
    const parsed = articleSchema.safeParse(item);
    if (!parsed.success) continue;
    const candidate = parsed.data;
    if (secret && JSON.stringify(candidate).includes(secret)) continue;
    const url = articleUrl(candidate.url);
    const title = plainText(candidate.title, 300);
    const source = plainText(candidate.source, 120);
    const published = /^\d{8}T\d{6}$/.test(candidate.time_published)
      ? DateTime.fromFormat(candidate.time_published, "yyyyLLdd'T'HHmmss", { zone: 'utc' }) : null;
    if (!url || !title || !source || !published?.isValid || published.toMillis() > now.getTime() + 300_000 || seen.has(url.href)) continue;
    seen.add(url.href);
    articles.push({
      id: createHash('sha256').update(url.href).digest('hex').slice(0, 24),
      title, source, sourceHost: url.hostname, publishedAt: published.toUTC().toISO()!, url: url.href,
      relatedInstrumentIds: [...new Set((candidate.ticker_sentiment ?? []).map(ticker => ticker.ticker).filter(ticker => known.has(ticker)))],
    });
  }
  if (payload.data.feed.length && !articles.length) throw new FeedProviderError('NEWS_INVALID_RESPONSE');
  // only headline metadata is retained, never article bodies, images or sentiment.
  articles.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return { provider: 'alpha-vantage', timeBasis: 'real-world', articles: articles.slice(0, 24) };
}

interface NewsOptions {
  store: DocumentStore;
  apiKey: string;
  instruments: Instrument[];
  now?: () => Date;
  fetcher?: typeof fetch;
}

export class NewsService {
  private readonly cache: DurableFeedCache<NewsFeed>;
  private readonly now: () => Date;

  constructor(private readonly options: NewsOptions) {
    this.now = options.now ?? (() => new Date());
    const credentialScope = createHash('sha256').update(options.apiKey.trim()).digest('hex').slice(0, 16);
    this.cache = new DurableFeedCache({
      store: options.store, key: `feeds/news-alpha-vantage-${credentialScope}`, now: this.now,
      ttlMs: SIX_HOURS, failureBackoffMs: SIX_HOURS, timeoutMs: 20_000, leaseMs: 30_000,
      load: (_previous, signal) => this.load(signal),
    });
  }

  async get() {
    return { provider: 'alpha-vantage' as const, timeBasis: 'real-world' as const, ...await this.cache.get() };
  }

  private async reserveRequest() {
    const current = this.now();
    const day = current.toISOString().slice(0, 10);
    const untilTomorrow = Date.parse(`${day}T00:00:00Z`) + DAY - current.getTime();
    await this.options.store.transaction(async transaction => {
      const path = `feedBudgets/news-alpha-vantage-${day}`;
      const budget = await transaction.get<{ attempts: number }>(path);
      const attempts = budget?.attempts ?? 0;
      if (!Number.isSafeInteger(attempts) || attempts < 0 || attempts >= 24) throw new FeedProviderError('NEWS_QUOTA_EXHAUSTED', untilTomorrow);
      // reserve before the request: failed attempts and restarts still consume budget.
      transaction.set(path, { attempts: attempts + 1 });
    });
  }

  private async load(signal: AbortSignal): Promise<NewsFeed> {
    const key = this.options.apiKey.trim();
    if (!key) throw new FeedProviderError('NEWS_NOT_CONFIGURED', DAY);
    await this.reserveRequest();
    const url = new URL(endpoint);
    url.search = new URLSearchParams({ function: 'NEWS_SENTIMENT', sort: 'LATEST', limit: '50', apikey: key }).toString();
    try {
      const response = await (this.options.fetcher ?? fetch)(url, { signal, redirect: 'error' });
      if (response.status === 429) throw new FeedProviderError('NEWS_RATE_LIMITED', DAY);
      if (!response.ok) throw new FeedProviderError('NEWS_PROVIDER_UNAVAILABLE');
      const raw: unknown = JSON.parse(await readResponseText(response, 2_000_000));
      if (raw && typeof raw === 'object') {
        const record = raw as Record<string, unknown>;
        const notice = String(record.Information ?? record.Note ?? record['Error Message'] ?? '');
        if (notice) {
          if (/premium/i.test(notice)) throw new FeedProviderError('NEWS_PREMIUM_REQUIRED', DAY);
          if (/rate|limit|frequency/i.test(notice)) throw new FeedProviderError('NEWS_RATE_LIMITED', DAY);
          throw new FeedProviderError('NEWS_PROVIDER_UNAVAILABLE');
        }
      }
      return parseAlphaNews(raw, this.options.instruments, this.now(), key);
    } catch (cause) {
      if (cause instanceof FeedProviderError) throw cause;
      // provider errors may echo the credential-bearing URL; expose codes only.
      throw new FeedProviderError('NEWS_PROVIDER_UNAVAILABLE');
    }
  }
}
