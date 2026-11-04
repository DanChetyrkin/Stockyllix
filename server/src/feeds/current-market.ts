import type { DocumentStore } from '../data/store.js';
import type { Instrument } from '../domain/model.js';
import { DurableFeedCache, FeedProviderError } from './cache.js';
import { fetchYahooCurrent, type CurrentQuote } from './yahoo.js';

interface SavedQuote {
  instrumentId: string;
  quote: CurrentQuote | null;
  failureCode: string | null;
}
interface CurrentMarketData { items: SavedQuote[]; retryNotBefore: string | null }
export interface CurrentQuoteView extends Omit<CurrentQuote, 'price' | 'priceAt' | 'fetchedAt' | 'providerCurrency'> {
  price: string | null;
  priceAt: string | null;
  fetchedAt: string | null;
  providerCurrency: string | null;
  stale: boolean;
  failureCode: string | null;
  priceAgeSeconds: number | null;
}

export interface CurrentMarketResponse {
  mode: 'current';
  source: 'yahoo';
  session: 'regular';
  extendedHoursIncluded: false;
  quotes: CurrentQuoteView[];
  fetchedAt: string | null;
  stale: boolean;
  refreshing: boolean;
  nextRefreshAt: string;
  failureCode: string | null;
  status: 'ready' | 'partial' | 'unavailable';
}

interface CurrentMarketOptions {
  store: DocumentStore;
  instruments: Instrument[];
  now?: () => Date;
  fetcher?: typeof fetch;
  ttlMs?: number;
  loadQuote?: (instrument: Instrument, signal: AbortSignal) => Promise<CurrentQuote>;
}

export class CurrentMarketService {
  private readonly cache: DurableFeedCache<CurrentMarketData>;
  private readonly now: () => Date;

  constructor(private readonly options: CurrentMarketOptions) {
    this.now = options.now ?? (() => new Date());
    this.cache = new DurableFeedCache({
      store: options.store, key: 'feeds/current-market-yahoo-v1', now: this.now,
      ttlMs: options.ttlMs ?? 600_000, timeoutMs: 30_000, leaseMs: 45_000,
      nextRefreshDelayMs: value => value.retryNotBefore ? Date.parse(value.retryNotBefore) - this.now().getTime() : 0,
      load: (previous, signal) => this.refresh(previous, signal),
    });
  }

  async get(): Promise<CurrentMarketResponse> {
    const state = await this.cache.get();
    const at = this.now().getTime();
    const quotes = this.options.instruments.map<CurrentQuoteView>(instrument => {
      const saved = state.value?.items.find(item => item.instrumentId === instrument.id);
      const quote = saved?.quote;
      const failureCode = saved?.failureCode ?? state.failureCode;
      if (quote) {
        const marketState = quote.regularSessionOpensAt && quote.regularSessionClosesAt
          ? at >= Date.parse(quote.regularSessionOpensAt) && at < Date.parse(quote.regularSessionClosesAt) ? 'open' : 'closed'
          : 'unknown';
        const age = Math.max(0, at - Date.parse(quote.priceAt));
        return {
          ...quote, marketState, failureCode, priceAgeSeconds: Math.floor(age / 1_000),
          stale: state.stale || !!failureCode || marketState === 'open' && age > Math.max(30, (quote.delayMinutes ?? 0) + 15) * 60_000,
        };
      }
      return {
        instrumentId: instrument.id, symbol: instrument.symbol, name: instrument.name,
        market: instrument.market, currency: instrument.currency, providerCurrency: null,
        price: null, previousClose: null, change: null, changePercent: null, priceAt: null, fetchedAt: null,
        exchangeTimezone: instrument.market === 'TA' ? 'Asia/Jerusalem' : 'America/New_York',
        source: 'yahoo' as const, sourceUrl: `https://finance.yahoo.com/quote/${encodeURIComponent(instrument.id)}/`,
        session: 'regular' as const, timeliness: 'unknown' as const, delayMinutes: null,
        marketState: 'unknown' as const, regularSessionOpensAt: null, regularSessionClosesAt: null, priceAgeSeconds: null,
        stale: true, failureCode: failureCode ?? 'QUOTE_UNAVAILABLE',
      };
    });
    const available = quotes.filter(quote => quote.price !== null).length;
    return {
      mode: 'current', source: 'yahoo', session: 'regular', extendedHoursIncluded: false,
      quotes, fetchedAt: state.fetchedAt, stale: state.stale || quotes.some(quote => quote.stale),
      refreshing: state.refreshing, nextRefreshAt: state.nextRefreshAt, failureCode: state.failureCode,
      status: available === 0 ? 'unavailable' : available < quotes.length || quotes.some(quote => quote.failureCode !== null) ? 'partial' : 'ready',
    };
  }

  private async refresh(previous: CurrentMarketData | null, outerSignal: AbortSignal): Promise<CurrentMarketData> {
    const signal = AbortSignal.any([outerSignal, AbortSignal.timeout(25_000)]);
    const saved = new Map(previous?.items.map(item => [item.instrumentId, item]) ?? []);
    let cursor = 0;
    let successes = 0;
    let stopped: FeedProviderError | undefined;
    let retryAfterMs = 0;
    const load = this.options.loadQuote ?? ((instrument: Instrument, requestSignal: AbortSignal) => fetchYahooCurrent(instrument, {
      fetcher: this.options.fetcher, now: this.now, signal: requestSignal,
    }));
    // prioritize missing/old observations when a previous bounded refresh was partial.
    const ordered = [...this.options.instruments].sort((a, b) => {
      const time = (id: string) => saved.get(id)?.quote?.fetchedAt ?? '';
      return time(a.id).localeCompare(time(b.id));
    });
    const worker = async () => {
      while (cursor < ordered.length && !signal.aborted && !stopped) {
        const instrument = ordered[cursor++]!;
        try {
          const quote = await load(instrument, signal);
          // an older provider result never moves a known observation backwards.
          const old = saved.get(instrument.id)?.quote;
          if (old && Date.parse(quote.priceAt) < Date.parse(old.priceAt)) throw new FeedProviderError('OLDER_PROVIDER_QUOTE');
          saved.set(instrument.id, { instrumentId: instrument.id, quote, failureCode: null });
          successes += 1;
        } catch (cause) {
          const error = cause instanceof FeedProviderError ? cause : new FeedProviderError('PROVIDER_UNAVAILABLE');
          saved.set(instrument.id, { instrumentId: instrument.id, quote: saved.get(instrument.id)?.quote ?? null, failureCode: error.code });
          if (['PROVIDER_RATE_LIMIT', 'PROVIDER_ACCESS_DENIED'].includes(error.code)) {
            stopped = error;
            retryAfterMs = Math.max(retryAfterMs, error.retryAfterMs ?? 60_000);
          }
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, ordered.length) }, worker));
    if (!successes) throw stopped ?? new FeedProviderError(signal.aborted ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE');
    for (const instrument of ordered.slice(cursor)) {
      saved.set(instrument.id, { instrumentId: instrument.id, quote: saved.get(instrument.id)?.quote ?? null,
        failureCode: stopped?.code ?? 'PROVIDER_TIMEOUT' });
    }
    return { items: [...saved.values()], retryNotBefore: retryAfterMs ? new Date(this.now().getTime() + retryAfterMs).toISOString() : null };
  }
}
