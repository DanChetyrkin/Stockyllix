import { DateTime } from 'luxon';
import { describe, expect, it, vi } from 'vitest';
import type { Instrument } from '../src/domain/model.js';
import { instruments } from '../src/world/catalog.js';
import { buildHistoricalDataset } from '../src/world/historical.js';
import { snapshotAt, type FxRow } from '../src/world/index.js';
import { fetchDailyBars, parseDailyBars, type DailyBar } from '../src/world/twelve-data.js';

const ta = instruments.find(item => item.id === 'LUMI.TA')!;
const us = instruments.find(item => item.id === 'AAPL')!;
const dates = ['2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];

function providerResponse(instrument: Instrument = ta, currency = instrument.currency as string) {
  return {
    status: 'ok',
    meta: { symbol: instrument.symbol, interval: '1day', currency, mic_code: instrument.market === 'TA' ? 'XTAE' : 'XNAS', exchange_timezone: instrument.market === 'TA' ? 'Asia/Jerusalem' : 'America/New_York' },
    values: [
      { datetime: '2026-10-05', open: '7425', close: '7510' },
      { datetime: '2026-10-02', open: '7300', close: '7400' },
    ],
  };
}

function fixture() {
  const bars = Object.fromEntries(instruments.map((instrument, asset) => [instrument.id, dates.map((date, day) => ({ date, open: String(100 + asset * 7 + day * 10), close: String(103 + asset * 7 + day * 10) }))])) as Record<string, DailyBar[]>;
  const fx: FxRow[] = dates.map((date, day) => ({
    date, rate: (3.6 + day * 0.01).toFixed(4), source: 'boi',
    availableAt: DateTime.fromISO(date, { zone: 'Asia/Jerusalem' }).plus({ days: 1 }).startOf('day').toUTC().toISO({ suppressMilliseconds: true })!,
  }));
  return { bars, fx };
}

function build(bars: Record<string, DailyBar[]>, fx: FxRow[], now = new Date('2026-11-04T00:00:00Z')) {
  return buildHistoricalDataset(instruments, bars, fx, '2026-10-05', '2026-10-09', now);
}

describe('Twelve Data daily OHLC import', () => {
  it('normalizes Israeli agorot once and preserves shekel and US dollar quotes', () => {
    expect(parseDailyBars(providerResponse(ta, 'ILA'), ta)).toEqual([
      { date: '2026-10-02', open: '73', close: '74' }, { date: '2026-10-05', open: '74.25', close: '75.1' },
    ]);
    expect(parseDailyBars(providerResponse(ta, 'ILS'), ta)[1]).toMatchObject({ open: '7425', close: '7510' });
    expect(parseDailyBars(providerResponse(us), us)[1]).toMatchObject({ open: '7425', close: '7510' });
    const alias = providerResponse(ta);
    alias.meta.exchange_timezone = 'Asia/Tel_Aviv';
    expect(parseDailyBars(alias, ta)).toHaveLength(2);
  });

  it('rejects a different TA listing, currency, symbol or exchange time zone', () => {
    for (const patch of [{ mic_code: 'XNAS' }, { currency: 'USD' }, { symbol: 'OTHER' }, { exchange_timezone: 'UTC' }]) {
      const raw = providerResponse(ta);
      Object.assign(raw.meta, patch);
      expect(() => parseDailyBars(raw, ta)).toThrow(/listing|currency/);
    }
  });

  it('rejects a non-US listing masquerading as a US dollar New York instrument', () => {
    for (const patch of [{ mic_code: 'XTAE' }, { currency: 'ILS' }, { symbol: 'OTHER' }, { exchange_timezone: 'Europe/London' }]) {
      const raw = providerResponse(us);
      Object.assign(raw.meta, patch);
      expect(() => parseDailyBars(raw, us)).toThrow(/listing|currency/);
    }
    const spy = instruments.find(item => item.id === 'SPY')!;
    const etf = providerResponse(spy);
    etf.meta.mic_code = 'ARCX';
    expect(parseDailyBars(etf, spy)).toHaveLength(2);
  });

  it('rejects missing, malformed, nonpositive and duplicate bars instead of repairing them', () => {
    const malformed: unknown[] = [
      null, {}, { ...providerResponse(), values: [] },
      { ...providerResponse(), values: [{ datetime: '2026-10-05', open: '10' }] },
      ...['0', '-1', 'NaN', 'Infinity', '1e3', ' 10'].map(open => ({ ...providerResponse(), values: [{ datetime: '2026-10-05', open, close: '10' }] })),
      { ...providerResponse(), values: [{ datetime: '2026-02-30', open: '10', close: '11' }] },
      { ...providerResponse(), values: [{ datetime: '2026-10-5', open: '10', close: '11' }] },
      { ...providerResponse(), values: [providerResponse().values[0], providerResponse().values[0]] },
    ];
    for (const raw of malformed) expect(() => parseDailyBars(raw, ta)).toThrow();
  });

  it('sends no stock request without a key or with an invalid date range', async () => {
    const fetcher = vi.fn<typeof fetch>();
    for (const key of ['', '   ']) await expect(fetchDailyBars(ta, '2026-10-02', '2026-10-09', key, fetcher)).rejects.toThrow(/API_KEY/);
    await expect(fetchDailyBars(ta, '2026-10-09', '2026-10-02', 'test-key', fetcher)).rejects.toThrow(/date range/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('requests unadjusted daily bars for the exact market and filters extra provider dates', async () => {
    const fetcher: typeof fetch = vi.fn(async (input) => {
      const url = new URL(String(input));
      expect(url.origin + url.pathname).toBe('https://api.twelvedata.com/time_series');
      expect(Object.fromEntries(url.searchParams)).toMatchObject({ symbol: 'LUMI', mic_code: 'XTAE', interval: '1day', start_date: '2026-10-02', end_date: '2026-10-05', adjust: 'none', order: 'asc', apikey: 'private-test-key' });
      const raw = providerResponse(ta, 'ILA');
      raw.values.push({ datetime: '2026-10-01', open: '7000', close: '7100' }, { datetime: '2026-10-06', open: '7600', close: '7700' });
      return new Response(JSON.stringify(raw));
    });
    const result = await fetchDailyBars(ta, '2026-10-02', '2026-10-05', 'private-test-key', fetcher);
    expect(result.map(bar => bar.date)).toEqual(['2026-10-02', '2026-10-05']);
    expect(result[1]).toMatchObject({ open: '74.25', close: '75.1' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not expose the API key in transport, HTTP or provider errors', async () => {
    const key = 'fake-key';
    const fetchers: (typeof fetch)[] = [
      async input => { throw new Error(`Cannot fetch ${String(input)}`); },
      async () => new Response(`Upstream rejected apikey=${key}`, { status: 403 }),
      async () => new Response(JSON.stringify({ status: 'error', message: `Invalid apikey=${key}` })),
      async () => new Response(`${key}: invalid JSON`),
    ];
    for (const fetcher of fetchers) {
      const error = await fetchDailyBars(ta, '2026-10-02', '2026-10-09', key, fetcher).catch(cause => cause);
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).not.toContain(key);
      expect(String(error)).not.toContain('apikey=');
    }
  });
});

describe('historical shared-world builder', () => {
  it('builds twenty instruments with known baselines and each market’s supplied daily open and close', () => {
    const { bars, fx } = fixture();
    const dataset = build(bars, fx);
    expect(dataset.source).toBe('historical');
    expect(dataset.instruments).toHaveLength(20);
    expect(dataset.sessions).toHaveLength(10);
    expect(dataset.initialSnapshot.prices['LUMI.TA']).toBe('103');
    expect(snapshotAt(dataset, '2026-10-05T06:59:59Z').prices['LUMI.TA']).toBe('103');
    const taOpen = snapshotAt(dataset, '2026-10-05T07:00:00Z');
    expect(taOpen.prices['LUMI.TA']).toBe('110');
    expect(taOpen.prices.AAPL).toBe(bars.AAPL![0]!.close);
    expect(snapshotAt(dataset, '2026-10-05T14:29:59Z').prices['LUMI.TA']).toBe('110');
    expect(snapshotAt(dataset, '2026-10-05T14:30:00Z').prices['LUMI.TA']).toBe('113');
    expect(snapshotAt(dataset, '2026-10-05T13:30:00Z').prices.AAPL).toBe(bars.AAPL![1]!.open);
    expect(snapshotAt(dataset, '2026-10-05T20:00:00Z').prices.AAPL).toBe(bars.AAPL![1]!.close);
    expect(dataset.events.every(event => Object.keys(event.snapshot.prices).length === 20)).toBe(true);
  });

  it('uses Bank of Israel observations only from the following Israel day', () => {
    const { bars, fx } = fixture();
    const dataset = build(bars, fx);
    expect(dataset.initialSnapshot).toMatchObject({ fx: '3.6000', fxAsOf: '2026-10-02' });
    expect(snapshotAt(dataset, '2026-10-05T20:59:59Z')).toMatchObject({ fx: '3.6000', fxAsOf: '2026-10-02' });
    expect(snapshotAt(dataset, '2026-10-05T21:00:00Z')).toMatchObject({ fx: '3.6100', fxAsOf: '2026-10-05' });
    expect(snapshotAt(dataset, dataset.endsAt).fxAsOf).toBe('2026-10-08');
    const early = structuredClone(fx);
    early[1]!.availableAt = '2026-10-05T12:00:00Z';
    expect(() => build(bars, early)).toThrow(/next-day/);
  });

  it('chooses the latest prior baseline regardless of bar array order', () => {
    const { bars, fx } = fixture();
    bars['LUMI.TA'] = [...bars['LUMI.TA']!, { date: '2026-10-01', open: '50', close: '51' }];
    expect(build(bars, fx).initialSnapshot.prices['LUMI.TA']).toBe('103');
  });

  it('fails on a missing security or whole market day rather than guessing a holiday or carrying a quote forward', () => {
    for (const market of ['TA', 'US'] as const) {
      const { bars, fx } = fixture();
      for (const instrument of instruments.filter(item => item.market === market)) bars[instrument.id] = bars[instrument.id]!.filter(bar => bar.date !== '2026-10-06');
      expect(() => build(bars, fx)).toThrow(/Missing .* prices on 2026-10-06.*verified trading calendar/);
    }
    const { bars, fx } = fixture();
    bars.AAPL = bars.AAPL!.filter(bar => bar.date !== '2026-10-06');
    expect(() => build(bars, fx)).toThrow(/Missing US prices/);
  });

  it('rejects a missing or stale stock baseline and an FX series without an available baseline', () => {
    const { bars, fx } = fixture();
    bars.AAPL = bars.AAPL!.filter(bar => bar.date >= '2026-10-05');
    expect(() => build(bars, fx)).toThrow(/baseline/);
    bars.AAPL.unshift({ date: '2026-09-25', open: '100', close: '103' });
    expect(() => build(bars, fx)).toThrow(/baseline/);
    const complete = fixture();
    expect(() => build(complete.bars, complete.fx.filter(row => row.date >= '2026-10-05'))).toThrow(/FX.*before the world starts/);
  });

  it('rejects an unfinished closing event but accepts that exact close once completed', () => {
    const { bars, fx } = fixture();
    expect(() => build(bars, fx, new Date('2026-10-09T19:59:59Z'))).toThrow(/fully completed/);
    expect(build(bars, fx, new Date('2026-10-09T20:00:00.000Z')).endsAt).toBe('2026-10-09T20:00:00Z');
    expect(() => buildHistoricalDataset(instruments, bars, fx, '2026-11-09', '2026-11-13', new Date('2026-11-04T00:00:00Z'))).toThrow(/fully completed/);
  });
});
