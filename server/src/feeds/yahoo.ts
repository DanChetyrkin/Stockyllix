import { DateTime } from 'luxon';
import { z } from 'zod';
import type { Instrument } from '../domain/model.js';
import { decimal } from '../domain/valuation.js';
import { readResponseText } from '../world/http.js';
import { FeedProviderError } from './cache.js';

export interface CurrentQuote {
  instrumentId: string;
  symbol: string;
  name: string;
  market: 'TA' | 'US';
  currency: 'ILS' | 'USD';
  providerCurrency: string;
  price: string;
  previousClose: string | null;
  change: string | null;
  changePercent: string | null;
  priceAt: string;
  fetchedAt: string;
  exchangeTimezone: string;
  source: 'yahoo';
  sourceUrl: string;
  session: 'regular';
  timeliness: 'delayed' | 'unknown';
  delayMinutes: number | null;
  marketState: 'open' | 'closed' | 'unknown';
  regularSessionOpensAt: string | null;
  regularSessionClosesAt: string | null;
}

const chartSchema = z.object({ chart: z.object({
  error: z.unknown().nullable(),
  result: z.array(z.object({
    meta: z.object({
      symbol: z.string(), currency: z.string(), exchangeTimezoneName: z.string(),
      regularMarketPrice: z.number().finite().positive(), regularMarketTime: z.number().int().positive(),
      exchangeDataDelayedBy: z.number().finite().nonnegative().max(1_440).optional(),
      currentTradingPeriod: z.object({ regular: z.object({ start: z.number().int().positive(), end: z.number().int().positive() }) }).optional(),
    }),
    timestamp: z.array(z.number().int().positive()).optional(),
    indicators: z.object({ quote: z.array(z.object({ close: z.array(z.number().nullable()).optional() })).optional() }).optional(),
  })).length(1).nullable(),
}) });

export function parseYahooCurrent(raw: unknown, instrument: Instrument, fetchedAt = new Date()): CurrentQuote {
  const response = chartSchema.safeParse(raw);
  if (!response.success || response.data.chart.error || !response.data.chart.result?.[0]) throw new FeedProviderError('INVALID_QUOTE');
  const { meta, timestamp = [], indicators } = response.data.chart.result[0];
  const zones = instrument.market === 'TA' ? ['Asia/Jerusalem', 'Asia/Tel_Aviv'] : ['America/New_York'];
  const currencies = instrument.market === 'TA' ? ['ILA', 'ILS'] : ['USD'];
  if (meta.symbol !== instrument.id || !zones.includes(meta.exchangeTimezoneName) || !currencies.includes(meta.currency)) {
    throw new FeedProviderError('WRONG_LISTING');
  }
  const priceAtMs = meta.regularMarketTime * 1_000;
  if (!Number.isFinite(fetchedAt.getTime()) || priceAtMs > fetchedAt.getTime() + 120_000) throw new FeedProviderError('INVALID_QUOTE_TIME');
  const date = DateTime.fromMillis(priceAtMs, { zone: meta.exchangeTimezoneName }).toISODate();
  const divisor = meta.currency === 'ILA' ? 100 : 1;
  const price = decimal(meta.regularMarketPrice).div(divisor);
  const closes = indicators?.quote?.[0]?.close ?? [];
  let previous: { at: number; value: number } | undefined;
  if (timestamp.length === closes.length) {
    for (let index = 0; index < timestamp.length; index += 1) {
      const at = timestamp[index]! * 1_000;
      const close = closes[index];
      const barDate = DateTime.fromMillis(at, { zone: meta.exchangeTimezoneName }).toISODate();
      if (at < priceAtMs && barDate && date && barDate < date && typeof close === 'number' && Number.isFinite(close) && close > 0 && (!previous || at > previous.at)) {
        previous = { at, value: close };
      }
    }
  }
  // five-day chartPreviousClose is not necessarily yesterday's close.
  const previousClose = previous ? decimal(previous.value).div(divisor) : null;
  const change = previousClose ? price.sub(previousClose) : null;
  const delay = meta.exchangeDataDelayedBy ?? null;
  const regular = meta.currentTradingPeriod?.regular;
  const sessionKnown = !!regular && regular.end > regular.start;
  return {
    instrumentId: instrument.id, symbol: instrument.symbol, name: instrument.name,
    market: instrument.market, currency: instrument.currency, providerCurrency: meta.currency,
    price: price.toFixed(10), previousClose: previousClose?.toFixed(10) ?? null,
    change: change?.toFixed(10) ?? null, changePercent: previousClose && change ? change.div(previousClose).mul(100).toFixed(6) : null,
    priceAt: new Date(priceAtMs).toISOString(), fetchedAt: fetchedAt.toISOString(),
    exchangeTimezone: meta.exchangeTimezoneName, source: 'yahoo',
    sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(instrument.id)}/`, session: 'regular',
    timeliness: delay !== null && delay > 0 ? 'delayed' : 'unknown', delayMinutes: delay,
    marketState: !sessionKnown ? 'unknown' : fetchedAt.getTime() >= regular.start * 1_000 && fetchedAt.getTime() < regular.end * 1_000 ? 'open' : 'closed',
    regularSessionOpensAt: sessionKnown ? new Date(regular.start * 1_000).toISOString() : null,
    regularSessionClosesAt: sessionKnown ? new Date(regular.end * 1_000).toISOString() : null,
  };
}

export function yahooRetryAfter(value: string | null, now: Date): number {
  if (!value) return 60_000;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000 : Date.parse(value) - now.getTime();
  return Number.isFinite(delay) ? Math.max(60_000, Math.min(delay, 86_400_000)) : 60_000;
}

export async function fetchYahooCurrent(instrument: Instrument, options: {
  fetcher?: typeof fetch; now?: () => Date; signal?: AbortSignal; timeoutMs?: number; automatedAccessAuthorized?: boolean;
} = {}): Promise<CurrentQuote> {
  if (options.automatedAccessAuthorized !== true) throw new FeedProviderError('SOURCE_PERMISSION_REQUIRED', 600_000);
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(instrument.id)}`);
  url.search = new URLSearchParams({ range: '5d', interval: '1d', includePrePost: 'false' }).toString();
  const signal = AbortSignal.any([AbortSignal.timeout(options.timeoutMs ?? 8_000), ...(options.signal ? [options.signal] : [])]);
  let response: Response;
  try { response = await (options.fetcher ?? fetch)(url, { signal, headers: { accept: 'application/json' } }); }
  catch { throw new FeedProviderError(signal.aborted ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE'); }
  const now = options.now?.() ?? new Date();
  if (response.status === 429) throw new FeedProviderError('PROVIDER_RATE_LIMIT', yahooRetryAfter(response.headers.get('retry-after'), now));
  if ([401, 403, 451].includes(response.status)) throw new FeedProviderError('PROVIDER_ACCESS_DENIED', 3_600_000);
  if (!response.ok) throw new FeedProviderError('PROVIDER_UNAVAILABLE');
  let raw: unknown;
  try { raw = JSON.parse(await readResponseText(response, 1_000_000)); }
  catch { throw new FeedProviderError(signal.aborted ? 'PROVIDER_TIMEOUT' : 'INVALID_QUOTE'); }
  return parseYahooCurrent(raw, instrument, now);
}
