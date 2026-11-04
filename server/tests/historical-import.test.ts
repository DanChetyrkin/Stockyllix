import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { instruments } from '../src/world/catalog.js';
import { buildHistoricalDataset, type DailyBar } from '../src/world/historical.js';
import { snapshotAt, type FxRow } from '../src/world/index.js';

const dates = ['2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];

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
