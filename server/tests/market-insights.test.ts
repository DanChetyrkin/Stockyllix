import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/data/memory-store.js';
import type { Dataset, World } from '../src/domain/model.js';
import { decimal } from '../src/domain/valuation.js';
import { GameService } from '../src/services/game-service.js';
import { MarketInsightsService, type WatchDirection } from '../src/services/market-insights.js';
import { createDataset } from '../src/world/index.js';

const dataset = createDataset('market-insights-test-seed');

async function fixture(data: Dataset = dataset) {
  const store = new MemoryStore();
  const game = new GameService(store, data);
  const world = await game.getWorld();
  const service = new MarketInsightsService(store, data, () => new Date('2026-11-03T10:00:00Z'));
  async function setTime(now: string, status: 'idle' | 'advancing' = 'idle') {
    await store.transaction(async tx => {
      const saved = (await tx.get<World>(`worlds/${world.id}`))!;
      const event = [...data.events].reverse().find(item => Date.parse(item.at) <= Date.parse(now));
      tx.set(`worlds/${world.id}`, { ...saved, now, status, snapshot: event?.snapshot ?? data.initialSnapshot, revision: saved.revision + 1 });
    });
  }
  return { store, service, world, setTime };
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
    const events = Array.from({ length: 300 }, (_, index) => ({ ...base, id: `sample-${index}`, at: new Date(Date.parse(base.at) + index * 60_000).toISOString() }));
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
    const expected = decimal(opens[1]!.snapshot.prices['LUMI.TA']!).div(closes[0]!.snapshot.prices['LUMI.TA']!).sub(1).mul(100).toFixed(6);
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
    const expected = decimal(closes[1]!.snapshot.prices.AAPL!).div(closes[0]!.snapshot.prices.AAPL!).sub(1).mul(100).toFixed(6);
    expect(await service.history('AAPL')).toMatchObject({ dailyChangePct: expected, previousCloseAt: closes[0]!.at });
  });
});

describe('personal target watchlist', () => {
  it('keeps users isolated and upserts one preference without creating financial records', async () => {
    const { service, store } = await fixture();
    const input = { instrumentId: 'AAPL', targetPrice: '150.000', direction: 'at_or_below' as const };
    await Promise.all([service.setWatch('alice', input), service.setWatch('alice', input)]);
    expect((await service.getWatchlist('alice')).items).toHaveLength(1);
    expect((await service.getWatchlist('alice')).items[0]!.targetPrice).toBe('150');
    expect((await service.getWatchlist('bob')).items).toEqual([]);
    expect(await store.list('users/alice/orders')).toEqual([]);
    await service.setWatch('alice', { ...input, targetPrice: '200', direction: 'at_or_above' });
    expect((await service.getWatchlist('alice')).items[0]!.direction).toBe('at_or_above');
    await service.removeWatch('alice', 'AAPL');
    const writes = store.operations.writes;
    await service.removeWatch('alice', 'AAPL');
    expect(store.operations.writes).toBe(writes);
  });

  it('evaluates each direction against the latest native-currency world price', async () => {
    const { service } = await fixture();
    const price = dataset.initialSnapshot.prices.AAPL!;
    await service.setWatch('alice', { instrumentId: 'AAPL', targetPrice: price, direction: 'at_or_below' });
    expect((await service.getWatchlist('alice')).items[0]).toMatchObject({ reached: true, currentPrice: price, currency: 'USD' });
    await service.setWatch('alice', { instrumentId: 'AAPL', targetPrice: '0.01', direction: 'at_or_above' });
    expect((await service.getWatchlist('alice')).items[0]!.reached).toBe(true);
    await service.setWatch('alice', { instrumentId: 'AAPL', targetPrice: '0.01', direction: 'at_or_below' });
    expect((await service.getWatchlist('alice')).items[0]!.reached).toBe(false);
  });

  it('validates target input and direction before writing', async () => {
    const { service } = await fixture();
    for (const targetPrice of ['0', '-1', 'NaN', 'Infinity', '1e3', ' 10', '1.1234567', '1000000000000']) {
      await expect(service.setWatch('alice', { instrumentId: 'AAPL', targetPrice, direction: 'at_or_below' })).rejects.toMatchObject({ code: 'INVALID_TARGET' });
    }
    await expect(service.setWatch('alice', { instrumentId: 'AAPL', targetPrice: '10', direction: 'cancel' as WatchDirection })).rejects.toMatchObject({ code: 'INVALID_DIRECTION' });
    await expect(service.setWatch('alice', { instrumentId: 'UNKNOWN', targetPrice: '10', direction: 'at_or_below' })).rejects.toMatchObject({ code: 'UNKNOWN_INSTRUMENT' });
  });

  it('caps preferences at 20, even with competing writes', async () => {
    const extra = { ...dataset.instruments[0]!, id: 'EXTRA', symbol: 'EXTRA' };
    const { service } = await fixture({ ...dataset, instruments: [...dataset.instruments, extra] });
    const results = await Promise.allSettled([...dataset.instruments, extra].map(instrument => service.setWatch('alice', { instrumentId: instrument.id, targetPrice: '10', direction: 'at_or_below' })));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(20);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    await service.setWatch('alice', { instrumentId: dataset.instruments[0]!.id, targetPrice: '20', direction: 'at_or_above' });
  });

  it('does not publish partial world state while a clock job is running', async () => {
    const { service, setTime } = await fixture();
    await setTime(dataset.startsAt, 'advancing');
    await expect(service.history('AAPL')).rejects.toMatchObject({ code: 'WORLD_ADVANCING' });
    await expect(service.getWatchlist('alice')).rejects.toMatchObject({ code: 'WORLD_ADVANCING' });
    await expect(service.setWatch('alice', { instrumentId: 'AAPL', targetPrice: '10', direction: 'at_or_below' })).rejects.toMatchObject({ code: 'WORLD_ADVANCING' });
  });
});
