import { describe, expect, it } from 'vitest';
import {
  buildSession,
  createDataset,
  getWeekId,
  isEligibleJoin,
  isMarketOpen,
  nextExecution,
  snapshotAt,
  validateDataset,
  validateFxRows,
} from '../src/world/index.js';

const dataset = createDataset('private-test-seed');

describe('assignment clock boundaries', () => {
  it('uses each market timezone across the different DST transition dates', () => {
    expect(buildSession('2026-10-23', 'TA')).toMatchObject({
      opensAt: '2026-10-23T07:00:00Z',
      closesAt: '2026-10-23T10:50:00Z',
    });
    expect(buildSession('2026-10-26', 'TA')).toMatchObject({
      opensAt: '2026-10-26T08:00:00Z',
      closesAt: '2026-10-26T15:30:00Z',
    });
    expect(buildSession('2026-10-30', 'US')).toMatchObject({
      opensAt: '2026-10-30T13:30:00Z',
      closesAt: '2026-10-30T20:00:00Z',
    });
    expect(buildSession('2026-11-02', 'US')).toMatchObject({
      opensAt: '2026-11-02T14:30:00Z',
      closesAt: '2026-11-02T21:00:00Z',
    });
  });

  it('treats open as inclusive and close as exclusive', () => {
    expect(isMarketOpen(dataset, 'TA', '2026-10-05T06:59:59Z')).toBe(false);
    expect(isMarketOpen(dataset, 'TA', '2026-10-05T07:00:00Z')).toBe(true);
    expect(isMarketOpen(dataset, 'TA', '2026-10-05T14:29:59Z')).toBe(true);
    expect(isMarketOpen(dataset, 'TA', '2026-10-05T14:30:00Z')).toBe(false);
    expect(nextExecution(dataset, 'LUMI.TA', '2026-10-05T06:59:59Z')).toMatchObject({
      kind: 'MARKET_OPEN',
      at: '2026-10-05T07:00:00Z',
    });
    expect(nextExecution(dataset, 'LUMI.TA', '2026-10-05T07:00:00Z')).toMatchObject({
      kind: 'MARKET_CLOSE',
      at: '2026-10-05T14:30:00Z',
    });
    expect(nextExecution(dataset, 'LUMI.TA', '2026-10-05T14:30:00Z')).toMatchObject({
      kind: 'MARKET_OPEN',
      at: '2026-10-06T07:00:00Z',
    });
  });

  it('waits through weekends, honors Friday TA hours, and cannot execute beyond data', () => {
    expect(buildSession('2026-10-10', 'TA')).toBeNull();
    expect(buildSession('2026-10-11', 'US')).toBeNull();
    expect(nextExecution(dataset, 'LUMI.TA', '2026-10-30T11:50:00+02:00')).toMatchObject({
      kind: 'MARKET_CLOSE',
      at: '2026-10-30T11:50:00Z',
    });
    expect(nextExecution(dataset, 'LUMI.TA', '2026-10-30T13:50:00+02:00')).toMatchObject({
      kind: 'MARKET_OPEN',
      at: '2026-11-02T08:00:00Z',
    });
    expect(nextExecution(dataset, 'LUMI.TA', '2026-11-02T17:30:00+02:00')).toBeNull();
    expect(nextExecution(dataset, 'AAPL', dataset.endsAt)).toBeNull();
    expect(nextExecution(dataset, 'UNKNOWN', dataset.startsAt)).toBeNull();
  });

  it('states the synthetic weekday holiday policy rather than pretending to be a real calendar', () => {
    expect(buildSession('2026-12-25', 'US')).not.toBeNull();
    expect(dataset.sourceDescription).toContain('no exchange-holiday claims');
  });

  it('ends the competition Saturday at midnight Israel time and resets Monday', () => {
    expect(dataset.events.find(event => event.id === 'WEEK_END:2026-10-10')).toMatchObject({
      at: '2026-10-09T21:00:00Z',
      weekId: '2026-10-05',
    });
    expect(dataset.events.find(event => event.id === 'WEEK_START:2026-10-12')).toMatchObject({
      at: '2026-10-11T21:00:00Z',
      weekId: '2026-10-12',
    });
    expect(getWeekId('2026-10-11T23:59:59+03:00')).toBe('2026-10-05');
    expect(getWeekId('2026-10-12T00:00:00+03:00')).toBe('2026-10-12');
    expect(isEligibleJoin('2026-10-05T09:59:59+03:00')).toBe(true);
    expect(isEligibleJoin('2026-10-05T10:00:00+03:00')).toBe(false);
    expect(isEligibleJoin('2026-10-06T09:00:00+03:00')).toBe(false);
  });
});

describe('private deterministic market world', () => {
  it('has twenty real names, both markets, complete prices, and reproducible changing quotes', () => {
    expect(dataset.instruments.filter(item => item.market === 'TA')).toHaveLength(10);
    expect(dataset.instruments.filter(item => item.market === 'US')).toHaveLength(10);
    expect(dataset.sessions).toHaveLength(42);
    expect(createDataset('private-test-seed')).toEqual(dataset);
    expect(createDataset('another-private-seed').id).not.toBe(dataset.id);
    expect(JSON.stringify(dataset)).not.toContain('private-test-seed');
    expect(dataset.sourceDescription).toContain('simulated stock prices');
    expect(dataset.sourceDescription).toContain('simulated FX');
    for (const event of dataset.events) {
      expect(Object.keys(event.snapshot.prices)).toHaveLength(20);
      expect(Object.values(event.snapshot.prices).every(price => Number(price) > 0)).toBe(true);
    }
    const returns = dataset.instruments.map(
      item =>
        Number(snapshotAt(dataset, dataset.endsAt).prices[item.id]) / Number(dataset.initialSnapshot.prices[item.id]) -
        1,
    );
    expect(returns.some(change => change > 0)).toBe(true);
    expect(returns.some(change => change < 0)).toBe(true);
  });

  it('reveals price updates only at the matching event and does not return shared mutable references', () => {
    const before = snapshotAt(dataset, '2026-10-05T06:59:59Z');
    const after = snapshotAt(dataset, '2026-10-05T07:00:00Z');
    expect(before.prices).toEqual(dataset.initialSnapshot.prices);
    expect(after.prices['LUMI.TA']).not.toBe(before.prices['LUMI.TA']);
    expect(after.prices.AAPL).toBe(before.prices.AAPL);
    after.prices.AAPL = '0';
    expect(snapshotAt(dataset, '2026-10-05T07:00:00Z').prices.AAPL).not.toBe('0');
    expect(() => snapshotAt(dataset, '2026-11-03T00:00:00Z')).toThrow('outside');
  });

  it('rejects missing data, duplicate events, invalid precision strings, and bad session boundaries', () => {
    const missingPrice = structuredClone(dataset);
    delete missingPrice.events[0]!.snapshot.prices.AAPL;
    expect(() => validateDataset(missingPrice)).toThrow('Incomplete');
    const duplicate = structuredClone(dataset);
    duplicate.events.splice(1, 0, duplicate.events[0]!);
    expect(() => validateDataset(duplicate)).toThrow('duplicate');
    const futureFx = structuredClone(dataset);
    futureFx.events[0]!.snapshot.fxAsOf = '2026-11-03';
    expect(() => validateDataset(futureFx)).toThrow('future FX');
    const boundary = structuredClone(dataset);
    boundary.sessions[0]!.closesAt = '2026-10-05T14:31:00Z';
    expect(() => validateDataset(boundary)).toThrow('calendar');
    const leakedOtherMarket = structuredClone(dataset);
    leakedOtherMarket.events.find(
      event => event.kind === 'MARKET_OPEN' && event.market === 'TA',
    )!.snapshot.prices.AAPL = '999';
    expect(() => validateDataset(leakedOtherMarket)).toThrow('outside its market');
    const missingWeek = structuredClone(dataset);
    missingWeek.events = missingWeek.events.filter(event => event.id !== 'WEEK_END:2026-10-10');
    expect(() => validateDataset(missingWeek)).toThrow('week boundary');
    const missingSession = structuredClone(dataset);
    const removed = missingSession.sessions.shift()!;
    missingSession.events = missingSession.events.filter(
      event => !(event.market === removed.market && [removed.opensAt, removed.closesAt].includes(event.at)),
    );
    expect(() => validateDataset(missingSession)).toThrow();
    expect(() =>
      validateFxRows([{ date: '2026-10-02', rate: 'NaN', availableAt: '2026-10-03T00:00:00Z', source: 'boi' }]),
    ).toThrow('Invalid FX');
    expect(() => getWeekId('2026-10-05T12:00:00')).toThrow('timezone');
  });
});
