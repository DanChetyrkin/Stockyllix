import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { prepareYahooDataset } from '../src/scripts/import-yahoo.js';
import { instruments } from '../src/world/catalog.js';
import { nextExecution, snapshotAt } from '../src/world/index.js';

const now = new Date('2026-11-04T12:00:00Z');

function fixture() {
  const dates: string[] = [];
  for (let day = DateTime.fromISO('2026-10-16'); day.toISODate()! <= '2026-11-02'; day = day.plus({ days: 1 })) if (day.weekday <= 5) dates.push(day.toISODate()!);
  const report = {
    library: 'yfinance', libraryVersion: 'fixture-only', autoAdjust: false, backAdjust: false, repair: false,
    startInclusive: '2026-10-01', endExclusive: '2026-11-03', notAttempted: [],
    results: instruments.map(item => ({
      symbol: item.id, market: item.market, status: 'ok', providerCurrency: item.market === 'TA' ? 'ILA' : 'USD',
      normalizedCurrency: item.currency, priceDivisor: item.market === 'TA' ? '100' : '1',
      exchangeTimezone: item.market === 'TA' ? 'Asia/Jerusalem' : 'America/New_York',
      missingComparedWithMarketPeers: [], issues: [], corporateActions: [] as { date: string; type: string; providerValue: string }[],
      bars: dates.filter(date => item.market !== 'TA' || date !== '2026-10-27').map(date => ({
        date, open: '100', close: '101', providerOpen: item.market === 'TA' ? '10000' : '100', providerClose: item.market === 'TA' ? '10100' : '101',
      })),
    })),
  };
  const fx = { source: 'boi', rows: dates.map(date => ({ date, rate: '3.6', source: 'boi', availableAt: DateTime.fromISO(date, { zone: 'Asia/Jerusalem' }).plus({ days: 1 }).startOf('day').toUTC().toISO()! })) };
  const calendar = { verified: true, reviewedAt: '2026-11-04T10:00:00Z', sourceUrls: ['https://www.tase.co.il/he/content/knowledge_center/trading_vacation_schedule'], closedDates: { TA: ['2026-10-27'], US: [] as string[] } };
  return { report, fx, calendar };
}

describe('private Yahoo historical replay preparation', () => {
  it('honours an explicit market holiday, baseline, buffer, provenance and conservative FX', () => {
    const { report, fx, calendar } = fixture();
    const dataset = prepareYahooDataset(report, fx, calendar, undefined, undefined, now);
    expect(dataset.source).toBe('historical');
    expect(dataset.sourceDescription).toContain('Yahoo Finance');
    expect(dataset.sourceDescription).not.toContain('Twelve');
    expect(dataset.sourceDescription).toContain('split-adjusted');
    expect(dataset.initialSnapshot.prices.AAPL).toBe('101');
    expect(dataset.sessions.some(item => item.market === 'TA' && item.date === '2026-10-27')).toBe(false);
    expect(dataset.sessions.some(item => item.market === 'US' && item.date === '2026-10-27')).toBe(true);
    expect(nextExecution(dataset, 'LUMI.TA', '2026-10-26T15:30:00Z')).toMatchObject({ at: '2026-10-28T08:00:00Z', kind: 'MARKET_OPEN' });
    expect(dataset.events.some(item => item.kind === 'WEEK_END' && item.weekId === '2026-10-26')).toBe(true);
    expect(dataset.endsAt).toBe('2026-11-02T21:00:00Z');
    expect(snapshotAt(dataset, dataset.startsAt).fxAsOf).toBe('2026-10-16');
    expect(nextExecution(dataset, 'AAPL', dataset.endsAt)).toBeNull();
    expect(prepareYahooDataset(report, fx, calendar, undefined, undefined, now).id).toBe(dataset.id);
  });

  it('requires a verified calendar and does not turn a missing whole market or instrument into a holiday', () => {
    const { report, fx, calendar } = fixture();
    expect(() => prepareYahooDataset(report, fx, { ...calendar, verified: false }, undefined, undefined, now)).toThrow();
    expect(() => prepareYahooDataset(report, fx, { ...calendar, closedDates: { TA: [], US: [] } }, undefined, undefined, now)).toThrow(/Missing TA prices/);
    report.results.find(item => item.symbol === 'AAPL')!.bars = report.results.find(item => item.symbol === 'AAPL')!.bars.filter(bar => bar.date !== '2026-10-20');
    expect(() => prepareYahooDataset(report, fx, calendar, undefined, undefined, now)).toThrow(/Missing US prices/);
  });

  it('rejects missing buffer data, partial results, wrongly normalized units and unhandled corporate actions', () => {
    const base = fixture();
    const short = structuredClone(base.report);
    short.endExclusive = '2026-11-01';
    expect(() => prepareYahooDataset(short, base.fx, base.calendar, undefined, undefined, now)).toThrow(/buffer/);
    const partial = structuredClone(base.report);
    partial.results.pop();
    expect(() => prepareYahooDataset(partial, base.fx, base.calendar, undefined, undefined, now)).toThrow();
    const units = structuredClone(base.report);
    units.results[0]!.bars[0]!.open = '10000';
    expect(() => prepareYahooDataset(units, base.fx, base.calendar, undefined, undefined, now)).toThrow(/normalized/);
    for (const type of ['Dividends', 'Stock Splits']) {
      const action = structuredClone(base.report);
      action.results[0]!.corporateActions.push({ date: '2026-10-20', type, providerValue: '1.5' });
      expect(() => prepareYahooDataset(action, base.fx, base.calendar, undefined, undefined, now)).toThrow(/corporate action/);
    }
  });
});
