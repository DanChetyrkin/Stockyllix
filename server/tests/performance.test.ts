import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/data/memory-store.js';
import type { DocumentStore, ListOptions } from '../src/data/store.js';
import type { Order } from '../src/domain/model.js';
import { decimal } from '../src/domain/valuation.js';
import { GameService } from '../src/services/game-service.js';
import { calculateCosts, PerformanceService } from '../src/services/performance-service.js';
import { createDataset } from '../src/world/index.js';

function fill(side: 'buy' | 'sell', units: string, amountAgorot: number, sequence: number): Order {
  return { id: String(sequence), uid: 'alice', worldId: 'test', instrumentId: 'AAPL', side, amountAgorot, sequence, status: 'executed',
    submittedAt: '2026-10-05T00:00:00Z', createdAt: '2026-11-03T00:00:00Z', executeEventId: 'event', executeAt: '2026-10-05T13:30:00Z', requestKey: String(sequence),
    fill: { price: '100', fx: '3', units, executedAt: '2026-10-05T13:30:00Z' } };
}

async function advanceTo(game: GameService, target: string) {
  const world = await game.getWorld();
  let state = await game.advance(target, randomUUID(), world.id);
  for (let attempt = 0; attempt < 100 && state.status !== 'idle'; attempt += 1) {
    if (!state.job) throw new Error('clock job missing');
    state = await game.step(state.job.id);
  }
  expect(state.status).toBe('idle');
}

async function trade(game: GameService, side: 'buy' | 'sell', amountILS: string) {
  const world = await game.getWorld();
  const submitted = await game.submitOrder('alice', { worldId: world.id, instrumentId: 'AAPL', side, amountILS }, randomUUID());
  await advanceTo(game, submitted.executeAt);
  const result = (await game.getOrders('alice')).orders.find(order => order.id === submitted.id)!;
  expect(result.status).toBe('executed');
  return result;
}

describe('performance accounting', () => {
  it('allocates weighted cost on partial sales, then clears it on a full sale', () => {
    const buys = [fill('buy', '10', 300000, 1), fill('buy', '10', 400000, 2)];
    const part = calculateCosts([...buys, fill('sell', '5', 200000, 3)]);
    expect(part.realizedILS.toFixed(2)).toBe('250.00');
    expect(part.positions.AAPL?.costILS).toBe('5250.000000000000000000000000');
    const full = calculateCosts([...buys, fill('sell', '5', 200000, 3), fill('sell', '15', 600000, 4)]);
    expect(full.realizedILS.toFixed(2)).toBe('1000.00');
    expect(Number(full.positions.AAPL?.costILS)).toBe(0);
  });

  it('uses execution order and ignores pending and rejected orders', () => {
    const first = fill('buy', '10', 300000, 2);
    first.fill!.executedAt = '2026-10-05T07:00:00Z';
    const second = fill('sell', '2', 80000, 1);
    const pending = { ...fill('buy', '100', 900000, 3), status: 'pending' as const };
    const result = calculateCosts([second, pending, first, { ...pending, status: 'rejected' }]);
    expect(result.realizedILS.toFixed(2)).toBe('200.00');
    expect(result.positions.AAPL?.units).toBe('8.000000000000000000');
  });

  it('rejects a ledger with more sold units than bought units', () => {
    expect(() => calculateCosts([fill('sell', '1', 10000, 1)])).toThrow(/order history/);
  });

  it('reports zero inception gains and the same world-period benchmark for a new player', async () => {
    const store = new MemoryStore();
    const dataset = createDataset('performance-tests');
    const game = new GameService(store, dataset);
    await game.initialize('alice', 'Alice');
    const result = await new PerformanceService(store, dataset).get('alice');
    expect(result.realizedILS).toBe('0.00');
    expect(result.unrealizedILS).toBe('0.00');
    expect(result.benchmarkReturnPct).toBe('0.0000');
    expect(result.periodReturnPct).toBe('0.0000');
    expect(result.dataMode).toBe('simulated');
  });

  it('treats a legitimate clock advance between portfolio and ledger reads as a changed world', async () => {
    const store = new MemoryStore();
    const dataset = createDataset('performance-racing-clock');
    const game = new GameService(store, dataset);
    await game.initialize('alice', 'Alice');
    await trade(game, 'buy', '1000');
    let advanced = false;
    const racingStore: DocumentStore = {
      get: store.get.bind(store), transaction: store.transaction.bind(store),
      async list<T>(collection: string, options?: ListOptions) {
        if (!advanced) {
          // the report has read the old portfolio; this is a real new trade and clock job.
          advanced = true;
          await trade(game, 'buy', '1000');
        }
        return store.list<T>(collection, options);
      },
    };
    await expect(new PerformanceService(racingStore, dataset).get('alice'))
      .rejects.toMatchObject({ code: 'WORLD_CHANGED', status: 409, retryable: true });
    expect(advanced).toBe(true);
    await expect(new PerformanceService(store, dataset).get('alice')).resolves.toHaveProperty('holdings');
  });

  it('accounts for an fx move from three to four with unchanged usd prices and a partial sale', async () => {
    const store = new MemoryStore();
    const dataset = createDataset('performance-execution-fx');
    const close = dataset.events.find(event => event.kind === 'MARKET_CLOSE' && event.market === 'US')!;
    for (const snapshot of [dataset.initialSnapshot, ...dataset.events.map(event => event.snapshot)]) {
      snapshot.prices.AAPL = '100';
      snapshot.prices.SPY = '100';
      snapshot.fx = Date.parse(snapshot.at) < Date.parse(close.at) ? '3' : '4';
    }
    const game = new GameService(store, dataset);
    await game.initialize('alice', 'Alice');
    const buy = await trade(game, 'buy', '3000');
    const sell = await trade(game, 'sell', '1600');
    expect(buy.fill).toMatchObject({ price: '100', fx: '3', units: '10.000000000000000000' });
    expect(sell.fill).toMatchObject({ price: '100', fx: '4', units: '4.000000000000000000' });
    const result = await new PerformanceService(store, dataset).get('alice');
    expect(result.realizedILS).toBe('400.00');
    expect(result.unrealizedILS).toBe('600.00');
    expect(result.totalProfitILS).toBe('1000.00');
    expect(result.holdings).toEqual([{ instrumentId: 'AAPL', costILS: '1800.00', unrealizedILS: '600.00' }]);
    expect(result.benchmarkReturnPct).toBe('33.3333');
  });

  it('reconciles realized and unrealized gains with actual rounded game fills to the nearest cent', async () => {
    const store = new MemoryStore();
    const dataset = createDataset('performance-rounded-fills');
    const game = new GameService(store, dataset);
    await game.initialize('alice', 'Alice');
    await trade(game, 'buy', '3000');
    await trade(game, 'buy', '2000');
    await trade(game, 'sell', '1000');
    const report = await new PerformanceService(store, dataset).get('alice');
    const current = await game.getPortfolio('alice');
    expect(current.portfolio.cashAgorot).toBe(99_600_000);
    expect(decimal(report.realizedILS).add(report.unrealizedILS).sub(report.totalProfitILS).abs().lte('0.01')).toBe(true);
    expect(report.totalProfitILS).toBe(decimal(current.summary.valueILS).sub(1_000_000).toFixed(2));
    expect(report.realizedILS).not.toBe('-0.00');
    expect(report.unrealizedILS).not.toBe('-0.00');
  });
});
