import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/data/memory-store.js';
import type { World } from '../src/domain/model.js';
import { GameService } from '../src/services/game-service.js';
import { MarketInsightsService } from '../src/services/market-insights.js';
import { createDataset } from '../src/world/index.js';
import { previousSessionClose, priceChangePct } from '../src/world/price-change.js';

const dataset = createDataset('market-changes-test');
const closes = (market: 'TA' | 'US') => dataset.events.filter(event => event.kind === 'MARKET_CLOSE' && event.market === market);

describe('market daily changes', () => {
  it('does not invent a previous close at baseline or during the first session', () => {
    expect(previousSessionClose(dataset, 'TA', dataset.startsAt)).toBeNull();
    expect(previousSessionClose(dataset, 'TA', closes('TA')[0]!.at)).toBeNull();
    expect(priceChangePct('100', undefined)).toBeNull();
  });

  it('uses the previous local trading date, not today’s close or a future event', () => {
    for (const market of ['TA', 'US'] as const) {
      const opening = dataset.events.find(event => event.kind === 'MARKET_OPEN' && event.market === market && event.at > closes(market)[0]!.at)!;
      expect(previousSessionClose(dataset, market, opening.at)?.id).toBe(closes(market)[0]!.id);
      expect(previousSessionClose(dataset, market, closes(market)[1]!.at)?.id).toBe(closes(market)[0]!.id);
    }
    expect(priceChangePct('90', '100')).toBe('-10.000000');
    expect(priceChangePct('110', '100')).toBe('10.000000');
    expect(priceChangePct('100', '100')).toBe('0.000000');
  });

  it('preserves the latest session’s comparison while the market is closed', () => {
    const us = closes('US');
    const ta = closes('TA');
    // israel midnight and a closed weekend do not create new price observations.
    const afterMidnight = new Date(Date.parse(us[1]!.at) + 2 * 3_600_000).toISOString();
    expect(previousSessionClose(dataset, 'US', afterMidnight)?.id).toBe(us[0]!.id);
    expect(previousSessionClose(dataset, 'TA', '2026-10-10T12:00:00Z')?.id).toBe(ta[3]!.id);
  });

  it('returns the same twenty changes as asset history without extra database reads', async () => {
    const store = new MemoryStore();
    const game = new GameService(store, dataset);
    const insights = new MarketInsightsService(store, dataset);
    const world = await game.getWorld();
    const event = closes('US')[1]!;
    await store.transaction(async tx => {
      const saved = (await tx.get<World>(`worlds/${world.id}`))!;
      tx.set(`worlds/${world.id}`, { ...saved, now: event.at, snapshot: event.snapshot });
    });
    const before = { ...store.operations };
    const market = await game.getMarket();
    // the existing pair of world reads is unchanged by the twenty calculated values.
    expect(store.operations.reads - before.reads).toBe(4);
    expect(store.operations.writes - before.writes).toBe(0);
    expect(market.instruments).toHaveLength(20);
    for (const asset of market.instruments) {
      const history = await insights.history(asset.id);
      expect(asset.dailyChangePct).toBe(history.dailyChangePct);
    }
  });
});
