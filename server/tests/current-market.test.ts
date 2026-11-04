import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/api/app.js';
import { MemoryStore } from '../src/data/memory-store.js';
import { CurrentMarketService } from '../src/feeds/current-market.js';
import { FeedProviderError } from '../src/feeds/cache.js';
import { fetchYahooCurrent, parseYahooCurrent, yahooRetryAfter } from '../src/feeds/yahoo.js';
import { instruments } from '../src/world/catalog.js';
import { createDataset } from '../src/world/index.js';
import { GameService } from '../src/services/game-service.js';

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
    await expect(fetchYahooCurrent(apple, { fetcher, now, automatedAccessAuthorized: true })).rejects.toMatchObject({ code: 'PROVIDER_RATE_LIMIT', retryAfterMs: 600_000 });
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

describe('fixed four-symbol owner diagnostic', () => {
  const quoteFor = (instrument: typeof apple, at = now()) => parseYahooCurrent(chart(instrument.id,
    instrument.market === 'TA' ? 'ILA' : 'USD', instrument.market === 'TA' ? 'Asia/Jerusalem' : 'America/New_York'), instrument, at);

  it('makes no source requests without actual provider permission, including diagnostic requests', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(fetchYahooCurrent(apple, { fetcher, now })).rejects.toMatchObject({ code: 'SOURCE_PERMISSION_REQUIRED' });
    const service = new CurrentMarketService({ store: new MemoryStore(), instruments, now, fetcher });
    const result = await service.checkSample();
    expect(result).toMatchObject({ status: 'unavailable', failureCode: 'SOURCE_PERMISSION_REQUIRED' });
    expect(result.diagnostic).toMatchObject({ attemptedSymbols: [], refreshedSymbols: [], allFourRefreshed: false });
    await service.get();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('leaves previously cached good prices visible but explicitly stale when permission is absent', async () => {
    const store = new MemoryStore();
    await new CurrentMarketService({ store, instruments, now, loadQuote: async instrument => quoteFor(instrument) }).get();
    const fetcher = vi.fn<typeof fetch>();
    const result = await new CurrentMarketService({ store, instruments, now, fetcher }).checkSample();
    expect(result.quotes).toHaveLength(4);
    expect(result.quotes.every(quote => quote.price !== null && quote.stale && quote.failureCode === 'SOURCE_PERMISSION_REQUIRED')).toBe(true);
    expect(result.diagnostic).toMatchObject({ servedFromCache: true, attemptedSymbols: [], allFourRefreshed: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('requests only two fixed US and two fixed TASE listings, sequentially and once for concurrent callers', async () => {
    let concurrent = 0;
    let maximum = 0;
    const loadQuote = vi.fn(async (instrument: typeof apple) => {
      maximum = Math.max(maximum, ++concurrent);
      await new Promise<void>(resolve => setImmediate(resolve));
      concurrent -= 1;
      return quoteFor(instrument);
    });
    const service = new CurrentMarketService({ store: new MemoryStore(), instruments, now, loadQuote });
    const results = await Promise.all(Array.from({ length: 30 }, () => service.checkSample()));
    expect(loadQuote.mock.calls.map(call => call[0].id)).toEqual(['AAPL', 'MSFT', 'LUMI.TA', 'POLI.TA']);
    expect(maximum).toBe(1);
    expect(results[0]?.quotes).toHaveLength(4);
    expect(results[0]?.diagnostic).toMatchObject({ servedFromCache: false, allFourRefreshed: true,
      requestedSymbols: ['AAPL', 'MSFT', 'LUMI.TA', 'POLI.TA'], attemptedSymbols: ['AAPL', 'MSFT', 'LUMI.TA', 'POLI.TA'] });
  });

  it('does not bypass an existing full-feed cooldown or a diagnostic failure after restart', async () => {
    let at = now();
    const store = new MemoryStore();
    const loadQuote = vi.fn(async () => { throw new FeedProviderError('PROVIDER_RATE_LIMIT', 900_000); });
    const options = { store, instruments, now: () => at, loadQuote };
    const full = await new CurrentMarketService(options).get();
    expect(full.failureCode).toBe('PROVIDER_RATE_LIMIT');
    const calls = loadQuote.mock.calls.length;
    const held = await new CurrentMarketService(options).checkSample();
    expect(held.diagnostic).toMatchObject({ servedFromCache: true, attemptedSymbols: [], allFourRefreshed: false });
    expect(held.nextRefreshAt).toBe(full.nextRefreshAt);
    expect(loadQuote).toHaveBeenCalledTimes(calls);
    at = new Date(at.getTime() + 900_001);
    const tested = await new CurrentMarketService(options).checkSample();
    expect(tested.diagnostic.attemptedSymbols).toEqual(['AAPL']);
    expect(tested.failureCode).toBe('PROVIDER_RATE_LIMIT');
    expect((await new CurrentMarketService(options).get()).nextRefreshAt).toBe(tested.nextRefreshAt);
    expect(loadQuote).toHaveBeenCalledTimes(calls + 1);
  });

  it('reuses shared good prices and does not claim a new provider check when served from cache', async () => {
    const store = new MemoryStore();
    const loadQuote = vi.fn(async (instrument: typeof apple) => quoteFor(instrument));
    const options = { store, instruments, now, loadQuote };
    const first = await new CurrentMarketService(options).checkSample();
    const repeat = await new CurrentMarketService(options).checkSample();
    expect(repeat.diagnostic).toMatchObject({ servedFromCache: true, attemptedSymbols: [], refreshedSymbols: [], allFourRefreshed: false });
    expect(repeat.fetchedAt).toBe(first.fetchedAt);
    expect(loadQuote).toHaveBeenCalledTimes(4);
    const full = await new CurrentMarketService(options).get();
    expect(full.quotes.filter(quote => quote.price !== null)).toHaveLength(4);
    expect(loadQuote).toHaveBeenCalledTimes(4);
  });

  it('preserves all other cached prices and marks their older fetches stale after a sample refresh', async () => {
    let at = now();
    const store = new MemoryStore();
    const loadQuote = vi.fn(async (instrument: typeof apple) => quoteFor(instrument, at));
    const options = { store, instruments, now: () => at, loadQuote, ttlMs: 1_000 };
    const first = await new CurrentMarketService(options).get();
    at = new Date(at.getTime() + 1_001);
    const sample = await new CurrentMarketService(options).checkSample();
    expect(sample.diagnostic.allFourRefreshed).toBe(true);
    expect(loadQuote).toHaveBeenCalledTimes(24);
    const full = await new CurrentMarketService(options).get();
    expect(full.quotes).toHaveLength(20);
    expect(full.quotes.filter(quote => quote.price !== null)).toHaveLength(20);
    expect(full.quotes.find(quote => quote.instrumentId === 'NVDA')).toMatchObject({
      price: first.quotes.find(quote => quote.instrumentId === 'NVDA')!.price, fetchedAt: first.fetchedAt, stale: true,
    });
    expect(loadQuote).toHaveBeenCalledTimes(24);
  });

  it('protects the HTTP diagnostic and rejects force, URL or symbol input before any provider call', async () => {
    const store = new MemoryStore();
    const loadQuote = vi.fn(async (instrument: typeof apple) => quoteFor(instrument));
    const game = new GameService(store, createDataset('fixed-four-http-test'));
    const world = await game.getWorld();
    const app = createApp({ game, currentMarket: new CurrentMarketService({ store, instruments, now, loadQuote }),
      adminUids: new Set(['admin']), currentMarketAccess: 'admin', corsOrigins: [], rateLimitEnabled: false,
      verifyToken: async token => ({ uid: token }), logger: () => undefined });
    const route = '/api/admin/feeds/current-market/check';
    expect((await request(app).post(route).send({})).status).toBe(401);
    expect((await request(app).post(route).auth('player', { type: 'bearer' }).send({})).status).toBe(403);
    expect((await request(app).post(route).auth('admin', { type: 'bearer' }).send({ force: true })).status).toBe(400);
    expect((await request(app).post(`${route}?symbol=OTHER`).auth('admin', { type: 'bearer' }).send({})).status).toBe(400);
    expect((await request(app).post(route).auth('admin', { type: 'bearer' }).send({ url: 'https://example.com' })).status).toBe(400);
    expect(loadQuote).not.toHaveBeenCalled();
    const result = await request(app).post(route).auth('admin', { type: 'bearer' }).send({});
    expect(result.status).toBe(200);
    expect(result.body.diagnostic.allFourRefreshed).toBe(true);
    expect(loadQuote).toHaveBeenCalledTimes(4);
    expect(await game.getWorld()).toEqual(world);
  });
});
