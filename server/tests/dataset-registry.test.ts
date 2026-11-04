import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/data/memory-store.js';
import type { Dataset, Portfolio, World } from '../src/domain/model.js';
import { GameService } from '../src/services/game-service.js';
import { MarketInsightsService } from '../src/services/market-insights.js';
import { PerformanceService } from '../src/services/performance-service.js';
import { createDataset } from '../src/world/index.js';
import { DatasetRegistry } from '../src/world/registry.js';

const legacy = createDataset('registry-legacy-fixture');
const candidate: Dataset = { ...createDataset('registry-other-fixture'), source: 'historical', sourceDescription: 'Historical fixture; not real provider prices' };

async function advance(service: GameService, target: string) {
  let response = await service.advance(target, `advance-${target}`);
  while (response.job) response = await service.step(response.job.id);
}

describe('immutable per-world replay datasets', () => {
  it('clones and freezes prices, rejects conflicting identifiers, and lists no future quotes', () => {
    const input = structuredClone(legacy);
    const registry = new DatasetRegistry(input, [candidate]);
    input.initialSnapshot.prices.AAPL = '1';
    expect(registry.get(legacy.id).initialSnapshot.prices.AAPL).toBe(legacy.initialSnapshot.prices.AAPL);
    expect(() => { registry.get(legacy.id).initialSnapshot.prices.AAPL = '2'; }).toThrow();
    for (const summary of registry.summaries()) {
      expect(summary).not.toHaveProperty('initialSnapshot');
      expect(summary).not.toHaveProperty('events');
      expect(summary).not.toHaveProperty('prices');
    }
    expect(registry.summaries()).toHaveLength(2);
    expect(() => new DatasetRegistry(legacy, [{ ...candidate, id: legacy.id }])).toThrow(/share an identifier/);
    expect(() => registry.get('unknown-dataset')).toThrow(/original price dataset/);
  });

  it('retains old transactions and portfolios when an explicit new world selects another dataset', async () => {
    const store = new MemoryStore();
    const originalService = new GameService(store, legacy);
    await originalService.initialize('alice', 'Alice');
    const original = await originalService.getWorld();
    await originalService.submitOrder('alice', { worldId: original.id, instrumentId: 'LUMI.TA', side: 'buy', amountILS: '100000' }, 'legacy-buy-request');
    await advance(originalService, '2026-10-05T07:00:00Z');
    await originalService.submitOrder('alice', { worldId: original.id, instrumentId: 'AAPL', side: 'buy', amountILS: '1000' }, 'legacy-pending-request');
    const before = {
      world: await store.get<World>(`worlds/${original.id}`),
      portfolio: await store.get<Portfolio>(`worlds/${original.id}/players/alice`),
      orders: await store.list(`worlds/${original.id}/players/alice/orders`),
    };
    const registry = new DatasetRegistry(legacy, [candidate]);
    const service = new GameService(store, registry);
    expect((await service.getWorld()).id).toBe(original.id);
    expect(service.listDatasets().map(dataset => dataset.id)).toEqual([candidate.id]);
    await expect(service.reset('disallowed-new-simulation', original.id, legacy.id)).rejects.toMatchObject({ code: 'HISTORICAL_DATA_REQUIRED' });
    const created = await service.reset('select-replay-request', original.id, candidate.id);
    expect(created.datasetId).toBe(candidate.id);
    expect(created.source).toBe('historical');
    expect((await service.reset('select-replay-request', original.id, candidate.id)).id).toBe(created.id);
    await expect(service.reset('select-replay-request', original.id, legacy.id)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(service.submitOrder('alice', { worldId: original.id, instrumentId: 'AAPL', side: 'buy', amountILS: '1' }, 'stale-order-request')).rejects.toMatchObject({ code: 'WORLD_CHANGED' });
    expect(await store.get(`worlds/${original.id}`)).toEqual(before.world);
    expect(await store.get(`worlds/${original.id}/players/alice`)).toEqual(before.portfolio);
    expect(await store.list(`worlds/${original.id}/players/alice/orders`)).toEqual(before.orders);

    await Promise.all([service.initialize('alice', 'Alice'), service.initialize('alice', 'Alice')]);
    expect((await service.getPortfolio('alice')).portfolio.cashAgorot).toBe(100_000_000);
    const insights = new MarketInsightsService(store, registry);
    expect((await insights.history('AAPL')).dataMode).toBe('historical');
    expect((await new PerformanceService(store, registry).get('alice')).dataMode).toBe('historical');
    await service.submitOrder('alice', { worldId: created.id, instrumentId: 'LUMI.TA', side: 'buy', amountILS: '100000' }, 'historical-buy-request');
    await advance(service, '2026-10-05T07:00:00Z');
    const order = (await service.getOrders('alice')).orders[0]!;
    expect(order.status).toBe('executed');
    expect(order.fill!.price).toBe(candidate.events.find(item => item.kind === 'MARKET_OPEN' && item.market === 'TA')!.snapshot.prices['LUMI.TA']);
    expect(order.fill!.price).not.toBe(legacy.events.find(item => item.kind === 'MARKET_OPEN' && item.market === 'TA')!.snapshot.prices['LUMI.TA']);
    const restarted = await service.reset('restart-current-replay', created.id);
    expect(restarted.datasetId).toBe(candidate.id);
  });

  it('allows only one competing reset and refuses activation during an unfinished clock job', async () => {
    const service = new GameService(new MemoryStore(), new DatasetRegistry(legacy, [candidate]));
    const world = await service.getWorld();
    const attempts = await Promise.allSettled([
      service.reset('first-concurrent-reset', world.id, candidate.id),
      service.reset('second-concurrent-reset', world.id, candidate.id),
    ]);
    expect(attempts.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(item => item.status === 'rejected')).toHaveLength(1);
    const current = await service.getWorld();
    await service.advance('2026-10-05T07:00:00Z', 'unfinished-job-key', current.id);
    await expect(service.reset('reset-during-clock', current.id, candidate.id)).rejects.toMatchObject({ code: 'WORLD_ADVANCING' });
  });

  it('uses real historical prices for an unspecified new-world choice while keeping an existing simulated world unchanged', async () => {
    const store = new MemoryStore();
    const original = await new GameService(store, legacy).getWorld();
    const service = new GameService(store, new DatasetRegistry(legacy, [candidate]));
    expect((await service.getWorld()).datasetId).toBe(legacy.id);
    const created = await service.reset('default-real-history-world', original.id);
    expect(created.datasetId).toBe(candidate.id);
    expect((await new GameService(new MemoryStore(), new DatasetRegistry(legacy, [candidate])).getWorld()).datasetId).toBe(candidate.id);
  });

  it('fails closed if an installed dataset is removed and marks the exact end without inventing prices', async () => {
    const store = new MemoryStore();
    const service = new GameService(store, new DatasetRegistry(legacy, [candidate]));
    const world = await service.getWorld();
    await service.reset('historical-world-select', world.id, candidate.id);
    await expect(new GameService(store, legacy).getWorld()).rejects.toMatchObject({ code: 'DATASET_MISMATCH' });
    await service.initialize('alice', 'Alice');
    expect((await service.getWorld()).finished).toBe(false);
    await advance(service, candidate.endsAt);
    const finished = await service.getWorld();
    expect(finished.finished).toBe(true);
    expect(finished.nextEvent).toBeNull();
    await expect(service.submitOrder('alice', { worldId: finished.id, instrumentId: 'AAPL', side: 'buy', amountILS: '100' }, 'after-history-ended')).rejects.toMatchObject({ code: 'DATASET_FINISHED' });
  });
});
