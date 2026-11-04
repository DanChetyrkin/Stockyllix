import { performance } from 'node:perf_hooks';
import { MemoryStore } from '../data/memory-store.js';
import { GameService } from '../services/game-service.js';
import { createDataset } from '../world/index.js';

// this measures the engine, not cloud capacity or firestore contention.
const count = Number(process.argv[2] ?? 1000);
if (!Number.isInteger(count) || count < 1 || count > 5000) throw new Error('choose between 1 and 5000 players');
const scenario = process.argv[3] ?? 'opening';
if (!['opening', 'week'].includes(scenario)) throw new Error('choose opening or week');
const store = new MemoryStore();
const dataset = createDataset('public-load-test-fixture');
const game = new GameService(store, dataset, { batchSize: 25 });
const started = performance.now();
const world = await game.getWorld();
const uids = Array.from({ length: count }, (_, index) => `player-${String(index).padStart(5, '0')}`);
await Promise.all(uids.map((uid, index) => game.initialize(uid, `Player ${index + 1}`)));
let accepted = 0;
let rejected = 0;
if (scenario === 'week') {
  await Promise.all(uids.map(async uid => {
    const input = { worldId: world.id, instrumentId: 'LUMI.TA', side: 'buy' as const, amountILS: '150000' };
    const results = await Promise.allSettled([
      game.submitOrder(uid, input, `load-buy-a-${uid}`),
      game.submitOrder(uid, input, `load-buy-b-${uid}`),
    ]);
    if (results.filter(result => result.status === 'fulfilled').length !== 1) throw new Error('concurrent concentration guard failed');
    accepted += 1;
    rejected += 1;
  }));
}
const target = dataset.events.find((event) => event.kind === (scenario === 'week' ? 'WEEK_END' : 'MARKET_OPEN'))!.at;
let state = await game.advance(target, 'load-test-request');
let steps = 0;
while (state.status !== 'idle') {
  state = await game.step(state.job!.id);
  steps += 1;
  if (steps > count * 10 + 100) throw new Error('load test exceeded its progress bound');
}
const board = await game.getLeaderboard(1);
if (board.total !== count || board.rows.some((row) => row.score !== '100.00000000')) {
  // compare scores as numbers; their text format may differ.
  if (board.total !== count || board.rows.some((row) => Number(row.score) !== 100)) throw new Error('ranking invariant failed');
}
if (scenario === 'week') {
  for (const uid of [uids[0]!, uids[uids.length - 1]!]) {
    const player = (await game.getPortfolio(uid)).portfolio;
    if (player.cashAgorot !== 85_000_000 || player.reservedCashAgorot !== 0 || player.pendingOrderIds.length !== 0 || Number(player.holdings['LUMI.TA']?.units) <= 0) throw new Error('settlement invariant failed');
  }
}
process.stdout.write(`${JSON.stringify({ environment: 'serialized in-memory adapter, not a cloud benchmark', scenario, players: count, accepted, rejectedBeforeAcceptance: rejected, clockSteps: steps, elapsedMs: Math.round(performance.now() - started), operations: store.operations, invariants: 'passed' }, null, 2)}\n`);
