import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/data/memory-store.js';
import type { Dataset, World } from '../src/domain/model.js';
import { decimal } from '../src/domain/valuation.js';
import { GameService } from '../src/services/game-service.js';
import { MarketInsightsService } from '../src/services/market-insights.js';
import { createDataset } from '../src/world/index.js';

const dataset = createDataset('market-insights-test-seed');

async function fixture(data: Dataset = dataset) {
  const store = new MemoryStore();
  const game = new GameService(store, data);
  const world = await game.getWorld();
  const service = new MarketInsightsService(store, data);
  async function setTime(now: string, status: 'idle' | 'advancing' = 'idle') {
    await store.transaction(async tx => {
      const saved = (await tx.get<World>(`worlds/${world.id}`))!;
      const event = [...data.events].reverse().find(item => Date.parse(item.at) <= Date.parse(now));
      tx.set(`worlds/${world.id}`, {
        ...saved,
        now,
        status,
        snapshot: event?.snapshot ?? data.initialSnapshot,
        revision: saved.revision + 1,
      });
    });
  }
  return { service, setTime };
}

describe('private market history', () => {
  it('starts with only the known baseline and never exposes future or other-market prices', async () => {
    const { service, setTime } = await fixture();
    expect((await service.history('AAPL')).points).toHaveLength(1);
    const opening = dataset.events.find(event => event.kind === 'MARKET_OPEN' && event.market === 'TA')!;
    await setTime(opening.at);
    const ta = await service.history('LUMI.TA');
    expect(ta.points).toHaveLength(2);
    expect(ta.points[1]).toEqual({ at: opening.at, price: opening.snapshot.prices['LUMI.TA'], kind: 'open' });
    expect(ta.dataMode).toBe('simulated');
    expect(ta.points.every(point => Date.parse(point.at) <= Date.parse(ta.asOf))).toBe(true);
    expect((await service.history('AAPL')).points).toHaveLength(1);
    await expect(service.history('UNKNOWN')).rejects.toMatchObject({ code: 'UNKNOWN_INSTRUMENT' });
  });

  it('bounds long history while preserving its first and last known samples', async () => {
    const base = dataset.events.find(event => event.kind === 'MARKET_OPEN' && event.market === 'TA')!;
    const events = Array.from({ length: 300 }, (_, index) => ({
      ...base,
      id: `sample-${index}`,
      at: new Date(Date.parse(base.at) + index * 60_000).toISOString(),
    }));
    const { service, setTime } = await fixture({ ...dataset, events });
    await setTime(events.at(-1)!.at);
    const history = await service.history('LUMI.TA');
    expect(history.points).toHaveLength(120);
    expect(history.points[0]!.kind).toBe('baseline');
    expect(history.points.at(-1)!.at).toBe(events.at(-1)!.at);
  });

  it('does not invent a previous close from the baseline or use a future close', async () => {
    const { service, setTime } = await fixture();
    expect(await service.history('LUMI.TA')).toMatchObject({ dailyChangePct: null, previousCloseAt: null });
    const opening = dataset.events.find(event => event.kind === 'MARKET_OPEN' && event.market === 'TA')!;
    const closing = dataset.events.find(event => event.kind === 'MARKET_CLOSE' && event.market === 'TA')!;
    await setTime(opening.at);
    expect(await service.history('LUMI.TA')).toMatchObject({ dailyChangePct: null, previousCloseAt: null });
    await setTime(closing.at);
    expect(await service.history('LUMI.TA')).toMatchObject({ dailyChangePct: null, previousCloseAt: null });
  });

  it('compares the current TA session against the previous known close in quote currency', async () => {
    const { service, setTime } = await fixture();
    const closes = dataset.events.filter(event => event.kind === 'MARKET_CLOSE' && event.market === 'TA');
    const opens = dataset.events.filter(event => event.kind === 'MARKET_OPEN' && event.market === 'TA');
    await setTime(opens[1]!.at);
    const expected = decimal(opens[1]!.snapshot.prices['LUMI.TA']!)
      .div(closes[0]!.snapshot.prices['LUMI.TA']!)
      .sub(1)
      .mul(100)
      .toFixed(6);
    const history = await service.history('LUMI.TA');
    expect(history).toMatchObject({ dailyChangePct: expected, previousCloseAt: closes[0]!.at });
    expect(history.points.some(point => point.at === closes[1]!.at)).toBe(false);
  });

  it('keeps the latest US trading-day change after Israel midnight without FX conversion', async () => {
    const { service, setTime } = await fixture();
    const closes = dataset.events.filter(event => event.kind === 'MARKET_CLOSE' && event.market === 'US');
    // israel is on the next calendar day; new york is still on the quote date.
    const afterIsraelMidnight = new Date(Date.parse(closes[1]!.at) + 2 * 60 * 60_000).toISOString();
    await setTime(afterIsraelMidnight);
    const expected = decimal(closes[1]!.snapshot.prices.AAPL!)
      .div(closes[0]!.snapshot.prices.AAPL!)
      .sub(1)
      .mul(100)
      .toFixed(6);
    expect(await service.history('AAPL')).toMatchObject({ dailyChangePct: expected, previousCloseAt: closes[0]!.at });
  });

  it('does not publish partial world state while a clock job is running', async () => {
    const { service, setTime } = await fixture();
    await setTime(dataset.startsAt, 'advancing');
    await expect(service.history('AAPL')).rejects.toMatchObject({ code: 'WORLD_ADVANCING' });
  });
});
