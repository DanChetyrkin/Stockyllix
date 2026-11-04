import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/data/memory-store.js';
import type { DocumentStore, Transaction } from '../src/data/store.js';
import type { Dataset, Order, Portfolio } from '../src/domain/model.js';
import { GameService } from '../src/services/game-service.js';
import { createDataset } from '../src/world/index.js';

// fixed test prices keep cash, reservations and equity independently checkable.
function fixedDataset(): Dataset {
  const dataset = createDataset('amzn-report-regression-fixture');
  const prices = Object.fromEntries(dataset.instruments.map(item => [item.id, item.currency === 'USD' ? '100' : '10']));
  for (const snapshot of [dataset.initialSnapshot, ...dataset.events.map(event => event.snapshot)]) {
    snapshot.prices = { ...prices };
    snapshot.fx = '4';
  }
  return dataset;
}

function prepare(dataset = fixedDataset(), store: DocumentStore = new MemoryStore()) {
  return { dataset, store, game: new GameService(store, dataset, { batchSize: 1, now: () => new Date('2026-11-04T12:00:00Z') }) };
}

async function complete(game: GameService, target: string, key: string) {
  let progress = await game.advance(target, key);
  let steps = 0;
  while (progress.job) {
    progress = await game.step(progress.job.id);
    if (++steps > 200) throw new Error('clock progress exceeded its test bound');
  }
}

async function buy(game: GameService, instrumentId: string, amountILS: string, key: string) {
  const world = await game.getWorld();
  return game.submitOrder('report-player', { worldId: world.id, instrumentId, side: 'buy', amountILS }, key);
}

describe('reported AMZN purchase and actionable trading failures', () => {
  it('separates all five balances for a pending 50,000 ILS order, then settles exactly once', async () => {
    const { game } = prepare();
    await game.initialize('report-player', 'Report player');
    const order = await buy(game, 'AMZN', '50000', 'reported-amzn-buy');
    const pending = await game.getPortfolio('report-player');
    expect(pending.summary).toMatchObject({ cashILS: '1000000.00', reservedCashILS: '50000.00', availableCashILS: '950000.00', valueILS: '1000000.00' });
    expect(pending.summary.holdings).toEqual([]);
    expect((await game.getOrders('report-player')).orders[0]).toMatchObject({ status: 'pending', executeAt: order.executeAt });

    await complete(game, order.executeAt, 'reported-amzn-open');
    const executed = await game.getPortfolio('report-player');
    expect(executed.summary).toMatchObject({ cashILS: '950000.00', reservedCashILS: '0.00', availableCashILS: '950000.00', valueILS: '1000000.00' });
    expect(executed.summary.holdings).toHaveLength(1);
    expect(executed.summary.holdings[0]).toMatchObject({ instrumentId: 'AMZN', valueILS: '50000.00', units: '125.000000000000000000' });

    const retry = await buy(game, 'AMZN', '50000', 'reported-amzn-buy');
    expect(retry).toMatchObject({ id: order.id, status: 'executed', fill: { price: '100', fx: '4' } });
    expect((await game.getPortfolio('report-player')).portfolio).toEqual(executed.portfolio);
    expect((await game.getOrders('report-player')).orders).toHaveLength(1);
  });

  it('does not let simultaneous purchases over-reserve the last available cash', async () => {
    const { game, dataset } = prepare();
    await game.initialize('report-player', 'Report player');
    for (const instrument of dataset.instruments.slice(0, 5)) await buy(game, instrument.id, '180000', `cash-setup-${instrument.id}`);
    const results = await Promise.allSettled(dataset.instruments.slice(5, 7).map(instrument => buy(game, instrument.id, '75000', `parallel-cash-${instrument.id}`)));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: 'INSUFFICIENT_CASH' } });
    const result = await game.getPortfolio('report-player');
    expect(result.summary).toMatchObject({ cashILS: '1000000.00', reservedCashILS: '975000.00', availableCashILS: '25000.00', valueILS: '1000000.00' });
    expect(result.portfolio.pendingOrderIds).toHaveLength(6);
  });

  it('counts both simultaneous AMZN requests toward the same 20% limit', async () => {
    const { game } = prepare();
    await game.initialize('report-player', 'Report player');
    const results = await Promise.allSettled([
      buy(game, 'AMZN', '150000', 'parallel-amzn-one'),
      buy(game, 'AMZN', '150000', 'parallel-amzn-two'),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: 'CONCENTRATION_LIMIT' } });
    expect((await game.getPortfolio('report-player')).summary).toMatchObject({ reservedCashILS: '150000.00', availableCashILS: '850000.00' });
    expect((await game.getOrders('report-player')).orders).toHaveLength(1);
  });

  it('recovers after a committed fill followed by a process failure without charging again', async () => {
    const base = new MemoryStore();
    let crashAfterFill = true;
    const store: DocumentStore = {
      get: base.get.bind(base), list: base.list.bind(base),
      transaction: async <T>(work: (transaction: Transaction) => Promise<T>) => {
        let settled = false;
        const result = await base.transaction(tx => work({
          get: tx.get,
          set: (path, value) => {
            settled ||= path.includes('/orders/') && (value as Partial<Order>).status === 'executed';
            tx.set(path, value);
          },
        }));
        if (settled && crashAfterFill) { crashAfterFill = false; throw new Error('failure after settlement commit'); }
        return result;
      },
    };
    const { dataset, game } = prepare(fixedDataset(), store);
    await game.initialize('report-player', 'Report player');
    const order = await buy(game, 'AMZN', '50000', 'restart-amzn-buy');
    let progress = await game.advance(order.executeAt, 'restart-amzn-clock');
    let sawCrash = false;
    while (progress.job) {
      try { progress = await game.step(progress.job.id); }
      catch (error) { expect((error as Error).message).toBe('failure after settlement commit'); sawCrash = true; break; }
    }
    expect(sawCrash).toBe(true);
    const recreated = prepare(dataset, store).game;
    let state = await recreated.getWorld();
    let remaining = 0;
    while (state.job) {
      await recreated.step(state.job.id);
      state = await recreated.getWorld();
      if (++remaining > 100) throw new Error('restart progress exceeded its test bound');
    }
    const result = await recreated.getPortfolio('report-player');
    expect(result.summary).toMatchObject({ cashILS: '950000.00', reservedCashILS: '0.00', availableCashILS: '950000.00', valueILS: '1000000.00' });
    expect(result.portfolio.holdings.AMZN?.units).toBe('125.000000000000000000');
    expect((await recreated.getOrders('report-player')).orders).toHaveLength(1);
    expect((await buy(recreated, 'AMZN', '50000', 'restart-amzn-buy')).status).toBe('executed');
  });

  it('reserves an existing position for a sell and releases it with a clear rejection after a price fall', async () => {
    const dataset = fixedDataset();
    const close = dataset.events.find(event => event.market === 'US' && event.kind === 'MARKET_CLOSE')!;
    for (const event of dataset.events.filter(event => Date.parse(event.at) >= Date.parse(close.at))) event.snapshot.prices.AMZN = '50';
    const { game } = prepare(dataset);
    await game.initialize('report-player', 'Report player');
    const pending = await buy(game, 'AMZN', '50000', 'sell-fixture-buy');
    await complete(game, pending.executeAt, 'sell-fixture-open');
    const world = await game.getWorld();
    const input = { worldId: world.id, instrumentId: 'AMZN', side: 'sell' as const, amountILS: '50000' };
    const sell = await game.submitOrder('report-player', input, 'reported-amzn-sell');
    const reserved = await game.getPortfolio('report-player');
    expect(reserved.portfolio.holdings.AMZN?.reservedUnits).toBe('125.000000000000000000');
    expect(reserved.summary).toMatchObject({ cashILS: '950000.00', reservedCashILS: '0.00' });
    await expect(game.submitOrder('report-player', { ...input, amountILS: '1' }, 'second-amzn-sell')).rejects.toMatchObject({ code: 'SELL_ALREADY_PENDING' });
    await complete(game, sell.executeAt, 'sell-fixture-close');
    expect((await game.getOrders('report-player')).orders[0]).toMatchObject({ status: 'rejected', rejection: { code: 'INSUFFICIENT_UNITS' } });
    const rejected = await game.getPortfolio('report-player');
    expect(rejected.portfolio.holdings.AMZN).toEqual({ units: '125.000000000000000000', reservedUnits: '0' });
    expect(rejected.summary).toMatchObject({ cashILS: '950000.00', availableCashILS: '950000.00', reservedCashILS: '0.00', valueILS: '975000.00' });
  });

  it('explains a paused advance and an exhausted price period without creating or reserving an order', async () => {
    const { game, dataset, store } = prepare();
    await game.initialize('report-player', 'Report player');
    const world = await game.getWorld();
    let advance = await game.advance(dataset.endsAt, 'exhaust-price-period');
    await expect(buy(game, 'AMZN', '50000', 'blocked-during-advance')).rejects.toMatchObject({ code: 'WORLD_ADVANCING', retryable: true });
    while (advance.job) advance = await game.step(advance.job.id);
    const before = await game.getPortfolio('report-player');
    expect((await game.getWorld()).finished).toBe(true);
    expect((await game.getMarket()).instruments.find(item => item.id === 'AMZN')?.nextExecutionAt).toBeNull();
    await expect(buy(game, 'AMZN', '50000', 'blocked-after-period')).rejects.toMatchObject({ code: 'DATASET_FINISHED' });
    expect((await game.getPortfolio('report-player')).portfolio).toEqual(before.portfolio);
    expect((await game.getOrders('report-player')).orders).toHaveLength(0);
    expect((await store.get<Portfolio>(`worlds/${world.id}/players/report-player`))?.reservedCashAgorot).toBe(0);
  });
});
