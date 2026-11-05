import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/data/memory-store.js';
import type { DocumentStore, ListOptions, Transaction } from '../src/data/store.js';
import type { Order, Portfolio, World, WorldEvent } from '../src/domain/model.js';
import { rankPortfolios } from '../src/domain/scoring.js';
import { executeOrder, parseAmount, reserveOrder } from '../src/domain/trading.js';
import { portfolioSummary, portfolioValue, sampleWeek } from '../src/domain/valuation.js';
import { GameService } from '../src/services/game-service.js';
import { createDataset } from '../src/world/index.js';

const dataset = createDataset('game-tests-private-seed');
const instrumentId = 'LUMI.TA';

function player(uid = 'alice'): Portfolio {
  return {
    uid, displayName: uid, cashAgorot: 100_000_000, reservedCashAgorot: 0, holdings: {}, pendingOrderIds: [], pendingBuyAgorot: {}, nextSequence: 1,
    week: { weekId: '2026-10-05', startValueILS: '1000000', peakValueILS: '1000000', mddRatio: '0', eligible: true },
    lastEventId: null, joinedAt: dataset.startsAt, createdAt: '2026-11-03T00:00:00Z',
  };
}

function order(amountILS = '100000.00', side: 'buy' | 'sell' = 'buy', id = 'order-a'): Order {
  return {
    id, uid: 'alice', worldId: 'world-test', instrumentId, side, amountAgorot: parseAmount(amountILS), sequence: 1,
    status: 'pending', submittedAt: dataset.startsAt, createdAt: '2026-11-03T00:00:00Z', executeEventId: 'fill', executeAt: '2026-10-05T07:00:00Z', requestKey: id,
  };
}

function event(price = '10', fx = '4'): WorldEvent {
  return { id: 'fill', at: '2026-10-05T07:00:00Z', kind: 'MARKET_OPEN', market: 'TA', weekId: '2026-10-05', snapshot: { ...dataset.initialSnapshot, at: '2026-10-05T07:00:00Z', prices: { ...dataset.initialSnapshot.prices, [instrumentId]: price, AAPL: '100' }, fx } };
}

function reserve(portfolio: Portfolio, pending: Order, fill = event()) {
  return reserveOrder(dataset, portfolio, pending, fill.snapshot);
}

async function advanceDone(service: GameService, target: string, key = `advance-${target}`) {
  let result = await service.advance(target, key);
  let steps = 0;
  while (result.job) {
    result = await service.step(result.job.id);
    if (++steps > 1000) throw new Error('clock did not finish');
  }
  return result;
}

describe('money, concentration, reservations and settlement', () => {
  it('validates cents without floating point parsing', () => {
    expect(parseAmount('0.01')).toBe(1);
    expect(parseAmount('1000000.12')).toBe(100_000_012);
    for (const invalid of ['0', '-1', '1.001', 'NaN', '1e3', ' 10', 'Infinity']) expect(() => parseAmount(invalid)).toThrow();
  });

  it('reserves cash without reducing equity and includes earlier pending buys in the 20% limit', () => {
    const first = order('150000');
    const reserved = reserve(player(), first);
    expect(reserved.reservedCashAgorot).toBe(15_000_000);
    expect(portfolioValue(dataset, event().snapshot, reserved).toString()).toBe('1000000');
    expect(() => reserve(reserved, order('50000.01', 'buy', 'second'))).toThrow(/20%/);
    expect(reserve(reserved, order('50000', 'buy', 'second')).reservedCashAgorot).toBe(20_000_000);
  });

  it('executes each due buy in FIFO order and checks actual exposure instead of penalizing the oldest order for later reservations', () => {
    const first = order('100000', 'buy', 'first');
    const second = { ...order('100000', 'buy', 'second'), sequence: 2 };
    const portfolio = reserve(reserve(player(), first), second);
    portfolio.cashAgorot -= 10_000_000;
    const a = executeOrder(dataset, portfolio, first, event());
    const b = executeOrder(dataset, a.portfolio, second, event());
    expect(a.order.status).toBe('executed');
    expect(b.order.status).toBe('rejected');
    expect(b.order.rejection?.code).toBe('CONCENTRATION_LIMIT');
    expect(b.portfolio.cashAgorot).toBe(80_000_000);
    expect(b.portfolio.reservedCashAgorot).toBe(0);
    expect(b.portfolio.pendingBuyAgorot).toEqual({});
  });

  it('does not force a sale after passive price growth but rejects an additional buy', () => {
    const pending = order('200000');
    const bought = executeOrder(dataset, reserve(player(), pending), pending, event()).portfolio;
    expect(bought.holdings[instrumentId]?.units).toBe('20000.000000000000000000');
    const higher = event('20');
    expect(() => reserve(bought, order('1', 'buy', 'more'), higher)).toThrow(/20%/);
    expect(bought.holdings[instrumentId]?.units).toBe('20000.000000000000000000');
  });

  it('uses the execution FX rate for US units', () => {
    const pending = { ...order('100000'), instrumentId: 'AAPL' };
    const reserved = reserve(player(), pending);
    const result = executeOrder(dataset, reserved, pending, event('10', '5'));
    expect(result.order.fill).toMatchObject({ price: '100', fx: '5', units: '200.000000000000000000' });
    expect(result.portfolio.cashAgorot).toBe(90_000_000);
  });

  it('locks the existing position for one ILS sell and rejects the whole sale after a price decline', () => {
    const initial = { ...player(), cashAgorot: 90_000_000, holdings: { [instrumentId]: { units: '10000', reservedUnits: '0' } } };
    const sell = order('100000', 'sell');
    const reserved = reserve(initial, sell);
    expect(sell.reservedUnits).toBe('10000');
    expect(() => reserve(reserved, order('1', 'sell', 'another'))).toThrow(/one sell/);
    const declined = executeOrder(dataset, reserved, sell, event('9'));
    expect(declined.order.status).toBe('rejected');
    expect(declined.portfolio.cashAgorot).toBe(initial.cashAgorot);
    expect(declined.portfolio.holdings[instrumentId]).toEqual({ units: '10000', reservedUnits: '0' });
  });

  it('does not use later purchases to enlarge a sell reservation or free concentration space before execution', () => {
    const initial = { ...player(), cashAgorot: 90_000_000, holdings: { [instrumentId]: { units: '10000', reservedUnits: '0' } } };
    const sell = order('100000', 'sell');
    const reserved = reserve(initial, sell);
    const enlarged = structuredClone(reserved);
    enlarged.holdings[instrumentId]!.units = '20000';
    expect(executeOrder(dataset, enlarged, sell, event('6')).order.status).toBe('rejected');
    expect(() => reserve(reserved, order('100000.01', 'buy', 'buy-after-sell'))).toThrow(/20%/);
  });

  it('settles fractional units with exact requested cents and never executes a terminal order twice', () => {
    const pending = order('12345.67');
    const first = executeOrder(dataset, reserve(player(), pending), pending, event('3.141592'));
    expect(first.order.fill?.units).toMatch(/^\d+\.\d{18}$/);
    expect(first.portfolio.cashAgorot).toBe(98_765_433);
    expect(executeOrder(dataset, first.portfolio, first.order, event())).toEqual(first);
  });

  it('caps pending references at twenty and prevents leverage and short sales', () => {
    let portfolio = player();
    for (let index = 0; index < 20; index += 1) portfolio = reserve(portfolio, order('1', 'buy', `pending-${index}`));
    expect(() => reserve(portfolio, order('1', 'buy', 'pending-21'))).toThrow(/20 orders/);
    expect(portfolio.reservedCashAgorot).toBe(2000);
    expect(() => reserve(player(), order('1', 'sell'))).toThrow(/exceeds/);
    let fullyReserved = player();
    for (const instrument of dataset.instruments.slice(0, 5)) {
      const pending = { ...order('200000', 'buy', instrument.id), instrumentId: instrument.id };
      fullyReserved = reserve(fullyReserved, pending);
    }
    expect(fullyReserved.reservedCashAgorot).toBe(fullyReserved.cashAgorot);
    expect(() => reserve(fullyReserved, { ...order('1', 'buy', 'sixth'), instrumentId: dataset.instruments[5]!.id })).toThrow(/cash/);
  });

  it('offers a conservative cent-denominated sell maximum without permitting shorts at a rounded display value', () => {
    const fill = event('72.127934');
    const buy = order('100000');
    const bought = executeOrder(dataset, reserve(player(), buy, fill), buy, fill).portfolio;
    const holding = portfolioSummary(dataset, fill.snapshot, bought).holdings[0]!;
    expect(holding.valueILS).toBe('100000.00');
    expect(holding.maxSellAmountILS).toBe('99999.99');
    expect(() => reserve(bought, order('100000.00', 'sell', 'too-much'), fill)).toThrow(/exceeds/);
    const sell = order(holding.maxSellAmountILS, 'sell', 'safe-sale');
    const reserved = reserve(bought, sell, fill);
    expect(portfolioSummary(dataset, fill.snapshot, reserved).holdings[0]?.maxSellAmountILS).toBe('0.00');
    const sold = executeOrder(dataset, reserved, sell, fill);
    expect(sold.order.status).toBe('executed');
    expect(sold.portfolio.cashAgorot).toBe(99_999_999);
    expect(Number(sold.portfolio.holdings[instrumentId]?.units)).toBeGreaterThan(0);
  });
});

describe('sampled weekly drawdown and percentile ranking', () => {
  it.each(['3.141592', '72.400001', '1560.000001'])('does not rank negligible fractional settlement dust as a loss at price %s', (price) => {
    const fill = event(price);
    const pending = { ...order('100000'), uid: 'buyer' };
    const buyer = executeOrder(dataset, reserve(player('buyer'), pending, fill), pending, fill).portfolio;
    const rows = rankPortfolios(dataset, fill.snapshot, [player('cash'), buyer]);
    expect(rows.map((row) => row.rank)).toEqual([1, 1]);
    expect(rows.every((row) => row.score === '100.000000')).toBe(true);
    expect(rows.every((row) => row.weeklyReturnPct === '0.000000')).toBe(true);
    expect(portfolioSummary(dataset, fill.snapshot, buyer).weeklyReturnPct).toBe('0.000000');
  });

  it('measures a later trough from the earlier peak and never uses a trough before its peak', () => {
    let week = player().week;
    for (const value of ['900000', '1200000', '1100000', '1000000', '1300000']) week = sampleWeek(week, value);
    expect(Number(week.mddRatio)).toBeCloseTo(1 / 6, 12);
    expect(week.peakValueILS).toBe('1300000.000000000000');
  });

  it('assigns top ties and a singleton 100, excludes training players, and applies 85/15 weights', () => {
    const best = player('best');
    const tied = player('tie');
    const worse = { ...player('worse'), cashAgorot: 90_000_000, week: { ...player().week, mddRatio: '0.1' } };
    const training = { ...player('training'), cashAgorot: 150_000_000, week: { ...player().week, eligible: false } };
    const rows = rankPortfolios(dataset, dataset.initialSnapshot, [best, tied, worse, training]);
    expect(rows.find((row) => row.uid === 'best')).toMatchObject({ returnPercentile: '100.000000', stabilityPercentile: '100.000000', score: '100.000000', rank: 1 });
    expect(rows.find((row) => row.uid === 'tie')?.rank).toBe(1);
    expect(rows.find((row) => row.uid === 'worse')?.score).toBe('0.000000');
    expect(rows.find((row) => row.uid === 'training')).toMatchObject({ rank: 0, eligible: false });
    expect(rankPortfolios(dataset, dataset.initialSnapshot, [best])[0]?.score).toBe('100.000000');
    const riskyWinner = { ...player('risky'), cashAgorot: 110_000_000, week: { ...player().week, mddRatio: '0.2' } };
    const weighted = rankPortfolios(dataset, dataset.initialSnapshot, [riskyWinner, best]);
    expect(weighted.find((row) => row.uid === 'risky')?.score).toBe('85.000000');
    expect(weighted.find((row) => row.uid === 'best')?.score).toBe('15.000000');
  });
});

describe('durable game service', () => {
  it('fills five exact 20% purchases in different instruments without letting fractional dust reject later fills', async () => {
    const capDataset = createDataset('cap-review-seed');
    const service = new GameService(new MemoryStore(), capDataset);
    await service.initialize('alice', 'Alice');
    const world = await service.getWorld();
    for (const instrument of capDataset.instruments.filter((item) => item.market === 'TA').slice(0, 5)) {
      await service.submitOrder('alice', { worldId: world.id, instrumentId: instrument.id, side: 'buy', amountILS: '200000' }, `cap-order-${instrument.id}`);
    }
    await advanceDone(service, capDataset.events.find((event) => event.kind === 'MARKET_OPEN' && event.market === 'TA')!.at);
    const orders = (await service.getOrders('alice')).orders;
    expect(orders).toHaveLength(5);
    expect(orders.every((pending) => pending.status === 'executed')).toBe(true);
    const result = await service.getPortfolio('alice');
    expect(result.portfolio.cashAgorot).toBe(0);
    expect(result.portfolio.reservedCashAgorot).toBe(0);
    expect(result.summary.valueILS).toBe('1000000.00');
  });

  it('creates the initial million only once, including parallel retries', async () => {
    const service = new GameService(new MemoryStore(), dataset);
    const results = await Promise.all([service.initialize('alice', 'Alice'), service.initialize('alice', 'Alice')]);
    expect(results[0]).toEqual(results[1]);
    expect((await service.getPortfolio('alice')).portfolio.cashAgorot).toBe(100_000_000);
  });

  it('deduplicates an order key and prevents two concurrent orders from bypassing concentration', async () => {
    const service = new GameService(new MemoryStore(), dataset);
    await service.initialize('alice', 'Alice');
    const world = await service.getWorld();
    const input = { worldId: world.id, instrumentId, side: 'buy' as const, amountILS: '150000' };
    const repeated = await Promise.all([service.submitOrder('alice', input, 'same-order-key'), service.submitOrder('alice', input, 'same-order-key')]);
    expect(repeated[0].id).toBe(repeated[1].id);
    expect((await service.getOrders('alice')).orders).toHaveLength(1);
    await expect(service.submitOrder('alice', { ...input, amountILS: '1' }, 'same-order-key')).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(service.submitOrder('alice', input, 'another-order-key')).rejects.toMatchObject({ code: 'CONCENTRATION_LIMIT' });
    expect((await service.getPortfolio('alice')).portfolio.reservedCashAgorot).toBe(15_000_000);
    await service.initialize('bob', 'Bob');
    const parallel = await Promise.allSettled([
      service.submitOrder('bob', input, 'parallel-order-one'),
      service.submitOrder('bob', input, 'parallel-order-two'),
    ]);
    expect(parallel.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((await service.getPortfolio('bob')).portfolio.reservedCashAgorot).toBe(15_000_000);
  });

  it('locks reads and new trades during an advance and settles the opening order once across service restarts', async () => {
    const store = new MemoryStore();
    let service = new GameService(store, dataset, { batchSize: 1 });
    await service.initialize('alice', 'Alice');
    const world = await service.getWorld();
    await service.submitOrder('alice', { worldId: world.id, instrumentId, side: 'buy', amountILS: '100000' }, 'opening-order-key');
    let job = await service.advance('2026-10-05T07:00:00Z', 'first-advance-key');
    await expect(service.getPortfolio('alice')).rejects.toMatchObject({ code: 'WORLD_ADVANCING' });
    await expect(service.submitOrder('alice', { worldId: world.id, instrumentId, side: 'buy', amountILS: '1' }, 'new-order-during-advance')).rejects.toMatchObject({ code: 'WORLD_ADVANCING' });
    while (job.job) {
      service = new GameService(store, dataset, { batchSize: 1 });
      job = await service.step(job.job.id);
    }
    const result = await service.getPortfolio('alice');
    expect(result.portfolio.cashAgorot).toBe(90_000_000);
    expect(result.portfolio.reservedCashAgorot).toBe(0);
    expect((await service.getOrders('alice')).orders[0]?.status).toBe('executed');
    expect((await service.getLeaderboard()).rows[0]?.uid).toBe('alice');
    await service.advance('2026-10-05T07:00:00Z', 'first-advance-key');
    expect((await service.getPortfolio('alice')).portfolio.cashAgorot).toBe(90_000_000);
  });

  it('rejects a second advance, handles expired leases, and retries after a crash beyond a committed player update', async () => {
    const base = new MemoryStore();
    let crashAfterSample = false;
    const store: DocumentStore = {
      get: base.get.bind(base), list: base.list.bind(base),
      transaction: async <T>(work: (tx: Transaction) => Promise<T>) => {
        let sampled = false;
        const result = await base.transaction((tx) => work({ get: tx.get, set: (path, value) => { sampled ||= path.includes('/valuations/'); tx.set(path, value); } }));
        if (sampled && crashAfterSample) { crashAfterSample = false; throw new Error('simulated process crash after commit'); }
        return result;
      },
    };
    let time = new Date('2026-11-03T10:00:00Z');
    const service = new GameService(store, dataset, { now: () => time, leaseMs: 1000, batchSize: 1 });
    await service.initialize('alice', 'Alice');
    const world = await service.getWorld();
    await service.submitOrder('alice', { worldId: world.id, instrumentId, side: 'buy', amountILS: '100000' }, 'crash-order-key');
    const initial = await service.advance('2026-10-05T07:00:00Z', 'crash-advance-key');
    await expect(service.advance('2026-10-05T08:00:00Z', 'parallel-advance-key')).rejects.toMatchObject({ code: 'WORLD_ADVANCING' });
    await expect(service.reset('reset-while-advancing')).rejects.toMatchObject({ code: 'WORLD_ADVANCING' });
    const path = `worlds/${world.id}`;
    await base.transaction(async (tx) => {
      const active = (await tx.get<World>(path))!;
      tx.set(path, { ...active, job: { ...active.job!, leaseOwner: 'dead-worker', leaseUntil: time.getTime() + 500 } });
    });
    await expect(service.step(initial.job!.id)).rejects.toMatchObject({ code: 'JOB_BUSY' });
    time = new Date(time.getTime() + 1001);
    crashAfterSample = true;
    await expect(service.step(initial.job!.id)).rejects.toThrow(/simulated process crash/);
    let next = await service.step(initial.job!.id);
    while (next.job) next = await service.step(next.job.id);
    expect((await service.getPortfolio('alice')).portfolio.cashAgorot).toBe(90_000_000);
    expect((await service.getOrders('alice')).orders[0]?.status).toBe('executed');
    expect(await base.list(`worlds/${world.id}/players/alice/valuations`)).toHaveLength(1);
  });

  it('archives a completed week and starts a new baseline without resetting cash or holdings', async () => {
    const service = new GameService(new MemoryStore(), dataset);
    await service.initialize('alice', 'Alice');
    await advanceDone(service, '2026-10-06T10:00:00Z');
    await service.initialize('late', 'Late');
    expect((await service.getPortfolio('late')).portfolio.week.eligible).toBe(false);
    await advanceDone(service, '2026-10-12T07:01:00Z');
    const alice = await service.getPortfolio('alice');
    expect(alice.portfolio.week.weekId).toBe('2026-10-12');
    expect(alice.portfolio.cashAgorot).toBe(100_000_000);
    expect((await service.getPortfolio('late')).portfolio.week.eligible).toBe(true);
    const archived = await service.getLeaderboard(1, '2026-10-05');
    expect(archived.rows.find((row) => row.uid === 'late')?.eligible).toBe(false);
    expect(archived.rows.find((row) => row.uid === 'alice')?.score).toBe('100.000000');
  });

  it('fences a stale worker after another worker takes its lease', async () => {
    const base = new MemoryStore();
    let worldId = '';
    let takeOverDuringQuery = false;
    let realNow = new Date('2026-11-03T10:00:00Z');
    const store: DocumentStore = {
      get: base.get.bind(base), transaction: base.transaction.bind(base),
      list: async <T>(collection: string, options?: ListOptions) => {
        const rows = await base.list<T>(collection, options);
        if (takeOverDuringQuery && collection.endsWith('/players')) {
          takeOverDuringQuery = false;
          await base.transaction(async (tx) => {
            const path = `worlds/${worldId}`;
            const world = (await tx.get<World>(path))!;
            tx.set(path, { ...world, job: { ...world.job!, fence: world.job!.fence + 1, leaseOwner: 'newer-worker', leaseUntil: realNow.getTime() + 1000 } });
          });
        }
        return rows;
      },
    };
    const service = new GameService(store, dataset, { now: () => realNow, leaseMs: 1000 });
    await service.initialize('alice', 'Alice');
    worldId = (await service.getWorld()).id;
    await service.submitOrder('alice', { worldId, instrumentId, side: 'buy', amountILS: '100000' }, 'fenced-order-key');
    const initial = await service.advance('2026-10-05T07:00:00Z', 'fenced-advance-key');
    takeOverDuringQuery = true;
    await expect(service.step(initial.job!.id)).rejects.toMatchObject({ code: 'LEASE_LOST' });
    expect((await base.get<World>(`worlds/${worldId}`))?.job?.leaseOwner).toBe('newer-worker');
    expect((await base.get<Portfolio>(`worlds/${worldId}/players/alice`))?.cashAgorot).toBe(100_000_000);
    realNow = new Date(realNow.getTime() + 2000);
    let progress = await service.step(initial.job!.id);
    while (progress.job) progress = await service.step(progress.job.id);
    expect((await service.getPortfolio('alice')).portfolio.cashAgorot).toBe(90_000_000);
  });

  it('freezes competition return and MDD at week end while portfolio valuation continues with weekend FX', async () => {
    const service = new GameService(new MemoryStore(), dataset);
    await service.initialize('alice', 'Alice');
    const world = await service.getWorld();
    await service.submitOrder('alice', { worldId: world.id, instrumentId: 'AAPL', side: 'buy', amountILS: '100000' }, 'weekend-us-buy');
    await advanceDone(service, '2026-10-10T12:00:00Z');
    const portfolio = await service.getPortfolio('alice');
    expect(portfolio.portfolio.week.finalValueILS).toBeDefined();
    const frozen = portfolio.portfolio.week;
    expect(sampleWeek(frozen, '1')).toEqual(frozen);
    const archived = await service.getLeaderboard(1, '2026-10-05');
    expect(archived.rows[0]?.weeklyReturnPct).toBe(portfolio.summary.weeklyReturnPct);
    expect(archived.rows[0]?.mddPct).toBe(portfolio.summary.mddPct);
    await advanceDone(service, '2026-10-12T00:00:00Z');
    expect((await service.getPortfolio('alice')).portfolio.week.finalValueILS).toBeUndefined();
  });

  it('tracks a real return day independently from world-day advancement and makes reset retries idempotent', async () => {
    let realNow = new Date('2026-11-03T10:00:00Z');
    const service = new GameService(new MemoryStore(), dataset, { now: () => realNow });
    await service.initialize('alice', 'Alice');
    expect((await service.recordReview('alice')).returnedOnLaterRealDay).toBe(false);
    await advanceDone(service, '2026-10-06T07:00:00Z');
    expect((await service.recordReview('alice')).returnedOnLaterRealDay).toBe(false);
    realNow = new Date('2026-11-04T10:00:00Z');
    expect((await service.recordReview('alice')).returnedOnLaterRealDay).toBe(true);
    const before = await service.getWorld();
    const a = await service.reset('reset-once-key');
    const b = await service.reset('reset-once-key');
    expect(a.id).toBe(b.id);
    expect(a.id).not.toBe(before.id);
    await expect(service.getPortfolio('alice')).rejects.toMatchObject({ code: 'PLAYER_NOT_INITIALIZED' });
  });

  it('records one review per real Israel day and compares it with the previous real-day value', async () => {
    const store = new MemoryStore();
    let realNow = new Date('2026-11-03T10:00:00Z');
    const service = new GameService(store, dataset, { now: () => realNow });
    await service.initialize('alice', 'Alice');
    const world = await service.getWorld();
    await service.submitOrder('alice', { worldId: world.id, instrumentId, side: 'buy', amountILS: '100000' }, 'review-initial-buy');
    await advanceDone(service, '2026-10-06T14:30:00Z');
    const first = await service.recordReview('alice');
    expect(first.baselineValueILS).toBe('1000000.000000000000');
    expect(first.previousReviewDate).toBeNull();
    expect(first.viewedValueILS).not.toBe(first.baselineValueILS);

    await advanceDone(service, '2026-10-07T14:30:00Z');
    expect(await service.recordReview('alice')).toEqual(first);

    // moving the game is not a real return visit; the next real date is.
    realNow = new Date('2026-11-04T10:00:00Z');
    const second = await service.recordReview('alice');
    expect(second.previousReviewDate).toBe(first.realDate);
    expect(second.baselineValueILS).toBe(first.viewedValueILS);
    expect(second.returnedOnLaterRealDay).toBe(true);

    await advanceDone(service, '2026-10-08T07:00:00Z');
    expect(await service.recordReview('alice')).toEqual(second);
    const activity = await store.get<{ distinctRealDays: number; lastValueILS: string }>(`worlds/${world.id}/players/alice/activity/current`);
    expect(activity).toMatchObject({ distinctRealDays: 2, lastValueILS: second.viewedValueILS });
    expect((await service.getPortfolio('alice')).insight).toMatch(/largest holding/);
  });

  it('never exposes future prices or accepts execution beyond the dataset', async () => {
    const service = new GameService(new MemoryStore(), dataset);
    await service.initialize('alice', 'Alice');
    const market = await service.getMarket();
    expect(market.instruments.find((instrument) => instrument.id === 'AAPL')?.price).toBe(dataset.initialSnapshot.prices.AAPL);
    const publicWorld = await service.getWorld();
    expect(publicWorld).not.toHaveProperty('events');
    expect(publicWorld).not.toHaveProperty('snapshot');
    await advanceDone(service, dataset.endsAt);
    await expect(service.submitOrder('alice', { worldId: publicWorld.id, instrumentId: 'AAPL', side: 'buy', amountILS: '100' }, 'end-of-dataset-key')).rejects.toMatchObject({ code: 'DATASET_FINISHED' });
  });

  it('rejects stale administrator actions after reset but permits an identical reset retry', async () => {
    const service = new GameService(new MemoryStore(), dataset);
    const previous = await service.getWorld();
    const created = await service.reset('guarded-reset-key', previous.id);
    await expect(service.advance('2026-10-05T07:00:00Z', 'stale-admin-advance', previous.id)).rejects.toMatchObject({ code: 'WORLD_CHANGED' });
    await expect(service.reset('stale-admin-reset', previous.id)).rejects.toMatchObject({ code: 'WORLD_CHANGED' });
    expect((await service.reset('guarded-reset-key', previous.id)).id).toBe(created.id);
    expect((await service.getWorld()).id).toBe(created.id);
  });
});
