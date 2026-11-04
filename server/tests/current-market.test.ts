import { describe, expect, it, vi } from 'vitest';
import { MemoryStore } from '../src/data/memory-store.js';
import { CurrentMarketService } from '../src/feeds/current-market.js';
import { FeedProviderError } from '../src/feeds/cache.js';
import { fetchYahooCurrent, parseYahooCurrent, yahooRetryAfter } from '../src/feeds/yahoo.js';
import { instruments } from '../src/world/catalog.js';

const apple = instruments.find(item => item.id === 'AAPL')!;
const leumi = instruments.find(item => item.id === 'LUMI.TA')!;
const now = () => new Date('2026-11-04T17:00:00Z');
const seconds = (value: string) => Date.parse(value) / 1_000;
function chart(id = 'AAPL', currency = 'USD', zone = 'America/New_York') {
  return { chart: { error: null, result: [{
    meta: { symbol: id, currency, exchangeTimezoneName: zone, regularMarketPrice: 110,
      regularMarketTime: seconds('2026-11-04T16:59:00Z'), chartPreviousClose: 50,
      postMarketPrice: 999, postMarketTime: seconds('2026-11-04T23:00:00Z'),
      currentTradingPeriod: { regular: { start: seconds('2026-11-04T14:30:00Z'), end: seconds('2026-11-04T21:00:00Z') } } },
    timestamp: ['2026-11-02T14:30:00Z', '2026-11-03T14:30:00Z', '2026-11-04T14:30:00Z'].map(seconds),
    indicators: { quote: [{ close: [80, 100, 109] }] },
  }] } };
}

describe('current regular-session Yahoo quotes', () => {
  it('uses the actual preceding session close and never five-day baseline or extended-hours price', () => {
    const result = parseYahooCurrent(chart(), apple, now());
    expect(result).toMatchObject({ price: '110.0000000000', previousClose: '100.0000000000', changePercent: '10.000000',
      session: 'regular', marketState: 'open', timeliness: 'unknown', delayMinutes: null,
      priceAt: '2026-11-04T16:59:00.000Z', fetchedAt: '2026-11-04T17:00:00.000Z' });
    expect(JSON.stringify(result)).not.toContain('999');
  });

  it('normalizes ILA prices and the previous close together, preserving percentage change', () => {
    const result = parseYahooCurrent(chart('LUMI.TA', 'ILA', 'Asia/Jerusalem'), leumi, now());
    expect(result).toMatchObject({ price: '1.1000000000', previousClose: '1.0000000000', change: '0.1000000000',
      changePercent: '10.000000', currency: 'ILS', providerCurrency: 'ILA' });
  });

  it('shows missing daily change instead of treating a multi-day baseline as yesterday', () => {
    const data = chart();
    data.chart.result[0]!.timestamp = [seconds('2026-11-04T14:30:00Z')];
    data.chart.result[0]!.indicators.quote[0]!.close = [109];
    expect(parseYahooCurrent(data, apple, now())).toMatchObject({ previousClose: null, change: null, changePercent: null });
  });

  it('uses exchange-local dates for the previous close when UTC dates differ', () => {
    const data = chart('LUMI.TA', 'ILA', 'Asia/Jerusalem');
    data.chart.result[0]!.meta.regularMarketTime = seconds('2026-11-03T22:30:00Z');
    data.chart.result[0]!.timestamp = [seconds('2026-11-03T10:00:00Z'), seconds('2026-11-03T22:00:00Z')];
    data.chart.result[0]!.indicators.quote[0]!.close = [100, 105];
    expect(parseYahooCurrent(data, leumi, now()).previousClose).toBe('1.0000000000');
  });

  it.each([
    ['wrong symbol', { symbol: 'MSFT' }], ['wrong currency', { currency: 'EUR' }],
    ['wrong timezone', { exchangeTimezoneName: 'Europe/London' }], ['zero price', { regularMarketPrice: 0 }],
    ['future price', { regularMarketTime: seconds('2027-01-01T00:00:00Z') }],
  ])('rejects %s rather than mislabelling the listing', (_label, replacement) => {
    const data = chart();
    Object.assign(data.chart.result[0]!.meta, replacement);
    expect(() => parseYahooCurrent(data, apple, now())).toThrow();
  });

  it('keeps provider delay explicit and handles Retry-After seconds/date formats', async () => {
    const data = chart();
    Object.assign(data.chart.result[0]!.meta, { exchangeDataDelayedBy: 15 });
    expect(parseYahooCurrent(data, apple, now())).toMatchObject({ timeliness: 'delayed', delayMinutes: 15 });
    expect(yahooRetryAfter('120', now())).toBe(120_000);
    expect(yahooRetryAfter('Wed, 04 Nov 2026 17:10:00 GMT', now())).toBe(600_000);
    const fetcher = vi.fn<typeof fetch>(async () => new Response('', { status: 429, headers: { 'retry-after': '600' } }));
    await expect(fetchYahooCurrent(apple, { fetcher, now })).rejects.toMatchObject({ code: 'PROVIDER_RATE_LIMIT', retryAfterMs: 600_000 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('cached current-market service', () => {
  it('refreshes once for concurrent users and restores quotes without new network work after restart', async () => {
    const store = new MemoryStore();
    const loadQuote = vi.fn(async () => parseYahooCurrent(chart(), apple, now()));
    const options = { store, instruments: [apple], now, loadQuote };
    const service = new CurrentMarketService(options);
    const result = await Promise.all(Array.from({ length: 100 }, () => service.get()));
    expect(loadQuote).toHaveBeenCalledTimes(1);
    expect(result[0]).toMatchObject({ mode: 'current', status: 'ready', extendedHoursIncluded: false });
    expect((await new CurrentMarketService(options).get()).quotes[0]?.price).toBe('110.0000000000');
    expect(loadQuote).toHaveBeenCalledTimes(1);
  });

  it('retains the last valid price and its timestamps when only one instrument fails', async () => {
    const store = new MemoryStore();
    let at = now();
    const loadQuote = vi.fn(async (instrument: typeof apple) => parseYahooCurrent(
      instrument.id === 'AAPL' ? chart() : chart('LUMI.TA', 'ILA', 'Asia/Jerusalem'), instrument, at));
    const options = { store, instruments: [apple, leumi], now: () => at, loadQuote, ttlMs: 1_000 };
    const first = await new CurrentMarketService(options).get();
    at = new Date(at.getTime() + 1_001);
    loadQuote.mockImplementation(async instrument => {
      if (instrument.id === 'LUMI.TA') throw new FeedProviderError('PROVIDER_UNAVAILABLE');
      return parseYahooCurrent(chart(), apple, at);
    });
    const next = await new CurrentMarketService(options).get();
    expect(next.status).toBe('partial');
    expect(next.quotes.find(quote => quote.instrumentId === 'LUMI.TA')).toMatchObject({
      price: first.quotes[1]?.price, fetchedAt: first.quotes[1]?.fetchedAt, priceAt: first.quotes[1]?.priceAt,
      stale: true, failureCode: 'PROVIDER_UNAVAILABLE',
    });
    expect(next.quotes[0]?.stale).toBe(false);
  });

  it('does not call a recent successful fetch stale solely because the exchange is closed', async () => {
    const data = chart();
    data.chart.result[0]!.meta.regularMarketTime = seconds('2026-10-30T20:00:00Z');
    data.chart.result[0]!.meta.currentTradingPeriod.regular = { start: seconds('2026-10-30T13:30:00Z'), end: seconds('2026-10-30T20:00:00Z') };
    const service = new CurrentMarketService({ store: new MemoryStore(), instruments: [apple], now,
      loadQuote: async () => parseYahooCurrent(data, apple, now()) });
    const result = await service.get();
    expect(result.quotes[0]).toMatchObject({ marketState: 'closed', stale: false });
    expect(result.quotes[0]!.priceAgeSeconds).toBeGreaterThan(86_400);
  });

  it('stops requesting more symbols after a provider rate limit and preserves shared cooldown', async () => {
    const store = new MemoryStore();
    const loadQuote = vi.fn(async () => { throw new FeedProviderError('PROVIDER_RATE_LIMIT', 900_000); });
    const options = { store, instruments, now, loadQuote };
    const result = await new CurrentMarketService(options).get();
    expect(result).toMatchObject({ status: 'unavailable', failureCode: 'PROVIDER_RATE_LIMIT' });
    expect(loadQuote.mock.calls.length).toBeLessThanOrEqual(3);
    await new CurrentMarketService(options).get();
    expect(loadQuote.mock.calls.length).toBeLessThanOrEqual(3);
  });
});
