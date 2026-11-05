import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/data/memory-store.js';
import { GameService } from '../src/services/game-service.js';
import { createDataset } from '../src/world/index.js';

const dataset = createDataset('clock-equivalence-private-fixture');
const target = '2026-10-12T14:00:00Z';

async function advance(game: GameService, to: string) {
  let result = await game.advance(to, `scenario-advance-${to}`);
  let steps = 0;
  while (result.job) {
    result = await game.step(result.job.id);
    if (++steps > 1000) throw new Error('scenario progress exceeded its bound');
  }
}

async function preparedGame() {
  const game = new GameService(new MemoryStore(), dataset, {
    batchSize: 1,
    now: () => new Date('2026-11-03T12:00:00Z'),
  });
  const world = await game.getWorld();
  await game.initialize('investor', 'Investor');
  await game.initialize('cash-player', 'Cash player');
  await game.submitOrder(
    'investor',
    { worldId: world.id, instrumentId: 'LUMI.TA', side: 'buy', amountILS: '123456.78' },
    'scenario-israeli-order',
  );
  await game.submitOrder(
    'investor',
    { worldId: world.id, instrumentId: 'AAPL', side: 'buy', amountILS: '98765.43' },
    'scenario-american-order',
  );
  return game;
}

describe('shared-world replay equivalence', () => {
  it('makes a multiweek jump identical to advancing each event group, including simultaneous week-end and FX updates', async () => {
    const jumped = await preparedGame();
    const stepped = await preparedGame();
    const eventTimes = [
      ...new Set(
        dataset.events
          .filter(
            event => Date.parse(event.at) > Date.parse(dataset.startsAt) && Date.parse(event.at) <= Date.parse(target),
          )
          .map(event => event.at),
      ),
    ];
    expect(
      dataset.events.some(
        (event, index) =>
          event.kind === 'WEEK_END' &&
          dataset.events[index + 1]?.at === event.at &&
          dataset.events[index + 1]?.kind === 'FX',
      ),
    ).toBe(true);

    await advance(jumped, target);
    for (const at of eventTimes) await advance(stepped, at);
    const last = await stepped.getWorld();
    if (Date.parse(last.now) < Date.parse(target)) await advance(stepped, target);

    for (const uid of ['investor', 'cash-player']) {
      const direct = await jumped.getPortfolio(uid);
      const incremental = await stepped.getPortfolio(uid);
      expect(direct.portfolio).toEqual(incremental.portfolio);
      expect(direct.summary).toEqual(incremental.summary);
      expect(direct.portfolio.week.weekId).toBe('2026-10-12');
      const outcomes = (await jumped.getOrders(uid)).orders.map(order => ({ ...order, worldId: 'compared-world' }));
      const otherOutcomes = (await stepped.getOrders(uid)).orders.map(order => ({
        ...order,
        worldId: 'compared-world',
      }));
      expect(outcomes).toEqual(otherOutcomes);
      expect(outcomes.every(order => order.status === 'executed')).toBe(true);
    }
    expect((await jumped.getLeaderboard(1, '2026-10-05')).rows).toEqual(
      (await stepped.getLeaderboard(1, '2026-10-05')).rows,
    );
    expect((await jumped.getLeaderboard()).rows).toEqual((await stepped.getLeaderboard()).rows);
    expect((await jumped.getPortfolio('cash-player')).portfolio.cashAgorot).toBe(100_000_000);
  });
});
