import { describe, expect, it, vi } from 'vitest';
import { BankIsraelService } from '../src/services/bank-israel.js';
import { BOI_LATEST_URL, fetchBoiLatest, fetchBoiRows, parseBoiCsv, parseBoiLatest } from '../src/world/boi.js';

const now = () => new Date('2026-11-04T00:00:00Z');
const quote = { key: 'USD', currentExchangeRate: 3.157, unit: 1, lastUpdate: '2026-11-03T13:21:05.8665609Z' };
const HEADER = 'SERIES_CODE,FREQ,BASE_CURRENCY,COUNTER_CURRENCY,UNIT_MEASURE,DATA_TYPE,DATA_SOURCE,TIME_COLLECT,CONF_STATUS,PUB_WEBSITE,UNIT_MULT,COMMENTS,TIME_PERIOD,OBS_VALUE,RELEASE_STATUS';
const row = (date: string, rate: string, comment = '') => `RER_USD_ILS,D,USD,ILS,ILS,OF00,BOI_MRKT,V,F,Y,0,${comment},${date},${rate},YP`;
const csv = (...rows: string[]) => [HEADER, ...rows].join('\r\n');

describe('official Bank of Israel reference rates', () => {
  it('validates the currency unit and the actual publication timestamp', () => {
    expect(parseBoiLatest(quote, now())).toEqual({
      source: 'boi', rate: '3.1570000000', date: '2026-11-03', observedAt: '2026-11-03T13:21:05.866Z',
      sourceUrl: BOI_LATEST_URL, kind: 'representative',
    });
  });

  it.each([
    { key: 'EUR' }, { unit: 100 }, { unit: '1' }, { currentExchangeRate: 0 }, { currentExchangeRate: -3 },
    { currentExchangeRate: 'NaN' }, { currentExchangeRate: Number.POSITIVE_INFINITY },
    { lastUpdate: '2026-02-30T12:00:00Z' }, { lastUpdate: '2026-11-05T12:00:00Z' },
    { lastUpdate: '2026-11-03' }, { lastUpdate: undefined },
  ])('rejects an invalid latest quote %j', replacement => {
    expect(() => parseBoiLatest({ ...quote, ...replacement }, now())).toThrow(/Bank of Israel/);
  });

  it('fetches the public currency selector without an API secret', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(quote), { headers: { 'content-type': 'application/json' } }));
    const result = await fetchBoiLatest({ fetcher, now });
    expect(result.rate).toBe('3.1570000000');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe(BOI_LATEST_URL);
    const headers = fetcher.mock.calls[0]?.[1]?.headers;
    expect(JSON.stringify(headers)).not.toMatch(/authorization|api.key/i);
  });

  it('parses quoted metadata and makes a daily observation available only next Israel day', () => {
    const result = parseBoiCsv(csv(row('2026-10-02', '3.06', '"reference, ""official""\nnote"'), row('2026-10-05', '3.10')), '2026-10-02', '2026-10-05', now());
    expect(result).toEqual([
      { date: '2026-10-02', rate: '3.0600000000', availableAt: '2026-10-02T21:00:00Z', source: 'boi' },
      { date: '2026-10-05', rate: '3.1000000000', availableAt: '2026-10-05T21:00:00Z', source: 'boi' },
    ]);
  });

  it.each([
    ['wrong currency', csv(row('2026-10-02', '3.06').replace(',USD,', ',EUR,'))],
    ['wrong unit', csv(row('2026-10-02', '3.06').replace(',Y,0,', ',Y,2,'))],
    ['wrong type', csv(row('2026-10-02', '3.06').replace(',OF00,', ',OTHER,'))],
    ['negative rate', csv(row('2026-10-02', '-3.06'))],
    ['zero rate', csv(row('2026-10-02', '0'))],
    ['invalid date', csv(row('2026-02-30', '3.06'))],
    ['future date', csv(row('2027-01-01', '3.06'))],
    ['missing column', 'TIME_PERIOD,OBS_VALUE\n2026-10-02,3.06'],
    ['broken row', csv('RER_USD_ILS,D,USD')],
    ['duplicate date', csv(row('2026-10-02', '3.06'), row('2026-10-02', '3.07'))],
    ['missing baseline', csv(row('2026-10-05', '3.10'))],
  ])('rejects %s in historical data', (_reason, document) => {
    expect(() => parseBoiCsv(document, '2026-10-02', '2026-10-05', now())).toThrow();
  });

  it('downloads the requested official series with source metadata and no generated fallback', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(csv(row('2026-10-02', '3.06'), row('2026-10-05', '3.10'))));
    const result = await fetchBoiRows('2026-10-02', '2026-10-05', { fetcher, now });
    expect(result.source).toBe('boi');
    expect(result.attribution).toMatch(/Bank of Israel/);
    expect(result.importedAt).toBe(now().toISOString());
    expect(result.availabilityPolicy).toMatch(/following calendar day/);
    expect(result.rows).toHaveLength(2);
    const url = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(url.hostname).toBe('edge.boi.gov.il');
    expect(url.pathname).toContain('RER_USD_ILS');
    expect(url.searchParams.get('startperiod')).toBe('2026-10-02');
    expect(url.searchParams.get('endperiod')).toBe('2026-10-05');
  });

  it('rejects HTTP failures, malformed JSON, excessive response bodies and future ranges', async () => {
    await expect(fetchBoiLatest({ fetcher: async () => new Response('unavailable', { status: 503 }), now })).rejects.toThrow(/HTTP 503/);
    await expect(fetchBoiLatest({ fetcher: async () => new Response('{invalid'), now })).rejects.toThrow();
    await expect(fetchBoiLatest({ fetcher: async () => new Response('x'.repeat(32_769)), now })).rejects.toThrow(/size|large|limit/i);
    await expect(fetchBoiRows('2026-10-02', '2026-10-05', { fetcher: async () => new Response('x'.repeat(1_000_001)), now })).rejects.toThrow(/size|large|limit/i);
    const fetcher = vi.fn<typeof fetch>();
    await expect(fetchBoiRows('2026-11-05', '2026-11-06', { fetcher, now })).rejects.toThrow(/future/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('passes a bounded timeout signal to the provider request', async () => {
    const fetcher: typeof fetch = async (_input, options) => new Promise<Response>((_resolve, reject) => {
      options!.signal!.addEventListener('abort', () => reject(new Error('provider request timed out')), { once: true });
    });
    await expect(fetchBoiLatest({ fetcher, now, timeoutMs: 10 })).rejects.toThrow(/timed out/);
  });
});

describe('cached public reference quote', () => {
  it('deduplicates concurrent requests and refreshes after ten minutes', async () => {
    let current = now();
    const load = vi.fn(async () => parseBoiLatest(quote, now()));
    const service = new BankIsraelService({ load, now: () => current });
    const results = await Promise.all(Array.from({ length: 12 }, () => service.get()));
    expect(load).toHaveBeenCalledTimes(1);
    for (const result of results) expect(result).toEqual({ ...results[0], stale: false });
    current = new Date(current.getTime() + 9 * 60_000);
    await service.get();
    expect(load).toHaveBeenCalledTimes(1);
    current = new Date(current.getTime() + 60_001);
    await service.get();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('marks the last successful quote stale after a refresh failure and backs off retries', async () => {
    let current = now();
    const load = vi.fn(async () => parseBoiLatest(quote, now()));
    const service = new BankIsraelService({ load, now: () => current });
    const first = await service.get();
    load.mockRejectedValue(new Error('network down'));
    current = new Date(current.getTime() + 10 * 60_000 + 1);
    const stale = await service.get();
    expect(stale).toMatchObject({ rate: first.rate, observedAt: first.observedAt, fetchedAt: first.fetchedAt, stale: true });
    expect(stale.notice).toMatch(/last successfully fetched/);
    expect(await service.get()).toEqual(stale);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('returns an explicit unavailable error before any successful quote, without retry storms', async () => {
    let current = now();
    const load = vi.fn<() => ReturnType<typeof fetchBoiLatest>>().mockRejectedValue(new Error('offline'));
    const service = new BankIsraelService({ load, now: () => current });
    await expect(service.get()).rejects.toMatchObject({ code: 'REFERENCE_FX_UNAVAILABLE', status: 503, retryable: true });
    await expect(service.get()).rejects.toMatchObject({ code: 'REFERENCE_FX_UNAVAILABLE' });
    expect(load).toHaveBeenCalledTimes(1);
    current = new Date(current.getTime() + 60_001);
    await expect(service.get()).rejects.toMatchObject({ code: 'REFERENCE_FX_UNAVAILABLE' });
    expect(load).toHaveBeenCalledTimes(2);
  });
});
