import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp, type GameServices } from '../src/api/app.js';
import { MemoryStore } from '../src/data/memory-store.js';
import { scopedStore } from '../src/data/scoped-store.js';
import type { DocumentStore } from '../src/data/store.js';
import { clockPath, type WorldClock } from '../src/domain/clock.js';
import { GameService } from '../src/services/game-service.js';
import { WorldClockService } from '../src/services/world-clock.js';
import { createDataset } from '../src/world/index.js';

const dataset = createDataset('clock-test-fixture-not-provider-data');
const initialServerTime = Date.parse('2026-11-04T12:00:00Z');

async function fixture(options: { maxSteps?: number } = {}) {
  let milliseconds = initialServerTime;
  const now = () => new Date(milliseconds);
  const store = new MemoryStore();
  const game = new GameService(store, dataset, { now });
  const world = await game.getWorld();
  await game.initialize('alice', 'Alice');
  const clock = new WorldClockService(store, game, dataset, { now, ...options });
  await clock.getWorld();
  return { store, game, clock, world, now, elapse: (value: number) => { milliseconds += value; } };
}

async function drain(clock: WorldClockService) {
  for (let index = 0; index < 250; index += 1) {
    clock.invalidate();
    await clock.synchronize();
    const world = await clock.getWorld();
    if (!world.clock.syncing) return world;
  }
  throw new Error('clock synchronization did not finish');
}

describe('persisted server-owned world clock', () => {
  it('anchors an existing world at its exact historical date and advances at one server second per game second', async () => {
    const { clock, game, world, elapse } = await fixture();
    elapse(15_000);
    const current = await clock.getWorld();
    expect(current.now).toBe(world.now);
    expect(current.clock.targetNow).toBe(new Date(Date.parse(world.now) + 15_000).toISOString());
    expect(current.clock.serverNow).toBe('2026-11-04T12:00:15.000Z');
    expect(current.clock.mode).toBe('historical');
    expect(current.clock.running).toBe(true);
    expect((await game.getPortfolio('alice')).summary.cashILS).toBe('1000000.00');
  });

  it('refuses new orders across a due-event boundary before settlement, then catches up after process recreation without double charging', async () => {
    const { clock, game, world, store, now, elapse } = await fixture({ maxSteps: 1 });
    const order = await game.submitOrder('alice', { worldId: world.id, instrumentId: 'AMZN', side: 'buy', amountILS: '50000' }, 'pending-amazon-request');
    expect((await game.getPortfolio('alice')).summary).toMatchObject({ cashILS: '1000000.00', reservedCashILS: '50000.00', availableCashILS: '950000.00', valueILS: '1000000.00' });
    elapse(Date.parse(order.executeAt) - Date.parse(world.now));
    await expect(game.submitOrder('alice', { worldId: world.id, instrumentId: 'AAPL', side: 'buy', amountILS: '1000' }, 'boundary-race-request')).rejects.toMatchObject({ code: 'CLOCK_SYNCING' });
    await clock.synchronize();
    expect((await game.getWorld()).status).toBe('advancing');
    const restartedGame = new GameService(store, dataset, { now });
    const restarted = new WorldClockService(store, restartedGame, dataset, { now, maxSteps: 1 });
    await drain(restarted);
    const settled = await restartedGame.getPortfolio('alice');
    expect(settled.summary).toMatchObject({ cashILS: '950000.00', reservedCashILS: '0.00', availableCashILS: '950000.00' });
    expect(settled.summary.holdings).toHaveLength(1);
    expect((await restartedGame.getOrders('alice')).orders[0]?.status).toBe('executed');
    await drain(restarted);
    expect((await restartedGame.getPortfolio('alice')).portfolio).toEqual(settled.portfolio);
  });

  it('supports custom pause/resume without consulting device time, rejects rewind and records the operator', async () => {
    const { clock, world, elapse, store } = await fixture();
    const key = randomUUID();
    await clock.configure('admin-user', { worldId: world.id, action: 'set', target: '2026-10-05T06:59:59Z' }, key);
    await drain(clock);
    const paused = await clock.getWorld();
    expect(paused.clock).toMatchObject({ mode: 'custom', running: false, targetNow: '2026-10-05T06:59:59.000Z' });
    elapse(60_000);
    expect((await clock.getWorld()).clock.targetNow).toBe(paused.clock.targetNow);
    await clock.configure('admin-user', { worldId: world.id, action: 'resume' }, randomUUID());
    elapse(1000);
    expect((await clock.getWorld()).clock.targetNow).toBe('2026-10-05T07:00:00.000Z');
    await drain(clock);
    await expect(clock.configure('admin-user', { worldId: world.id, action: 'set', target: '2026-10-05T06:59:59Z' }, randomUUID())).rejects.toMatchObject({ code: 'CLOCK_BACKWARD' });
    const state = await store.get<WorldClock>(clockPath(world.id));
    expect(state?.updatedBy).toBe('admin-user');
    const audit = await clock.audit();
    expect(audit.entries).toHaveLength(2);
    expect(audit.entries).toEqual(expect.arrayContaining([expect.objectContaining({ actor: 'admin-user', action: 'set' })]));
  });

  it('treats an administrator request retry as the same action and rejects conflicting reuse', async () => {
    const { clock, world } = await fixture();
    const key = randomUUID();
    const input = { worldId: world.id, action: 'pause' as const };
    await clock.configure('admin', input, key);
    const before = (await clock.getWorld()).clock;
    await clock.configure('admin', input, key);
    expect((await clock.getWorld()).clock).toEqual(before);
    expect((await clock.audit()).entries).toHaveLength(1);
    await expect(clock.configure('admin', { ...input, action: 'resume' }, key)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('rejects real time before changing a historical world or its audit log', async () => {
    const { clock, world, game } = await fixture();
    const before = await clock.getWorld();
    const portfolio = await game.getPortfolio('alice');
    await expect(clock.configure('admin', { worldId: world.id, action: 'realtime' }, randomUUID())).rejects.toMatchObject({ code: 'REALTIME_DATA_UNAVAILABLE' });
    expect(await clock.getWorld()).toEqual(before);
    expect(await game.getPortfolio('alice')).toEqual(portfolio);
    expect((await clock.audit()).entries).toHaveLength(0);
  });

  it('next-event controls use the dataset and pause custom playback', async () => {
    const { clock, world } = await fixture();
    const expected = (await clock.getWorld()).nextEvent!.at;
    await clock.configure('admin', { worldId: world.id, action: 'next' }, randomUUID());
    const current = await drain(clock);
    expect(Date.parse(current.now)).toBe(Date.parse(expected));
    expect(current.clock).toMatchObject({ mode: 'custom', running: false });
  });

  it('next trading event skips currency and weekly events but still processes them in between', async () => {
    const { clock, world } = await fixture();
    await clock.configure('admin', { worldId: world.id, action: 'set', target: '2026-10-05T20:00:00Z' }, randomUUID());
    const previous = await drain(clock);
    const expected = dataset.events.find(event => ['MARKET_OPEN', 'MARKET_CLOSE'].includes(event.kind) && Date.parse(event.at) > Date.parse(previous.clock.targetNow))!;
    expect(previous.nextEvent?.kind).toBe('FX');
    await clock.configure('admin', { worldId: world.id, action: 'next' }, randomUUID());
    expect(Date.parse((await drain(clock)).now)).toBe(Date.parse(expected.at));
  });

  it('processes weekly boundaries during catch-up and stops at the real end without resetting cash', async () => {
    const { clock, world, game, elapse } = await fixture({ maxSteps: 2 });
    await game.submitOrder('alice', { worldId: world.id, instrumentId: 'AMZN', side: 'buy', amountILS: '50000' }, 'weekly-amazon-request');
    elapse(Date.parse(dataset.endsAt) - Date.parse(world.now) + 86_400_000);
    const ended = await drain(clock);
    expect(ended.finished).toBe(true);
    expect(ended.clock).toMatchObject({ finished: true, running: false, targetNow: new Date(dataset.endsAt).toISOString() });
    expect((await game.getOrders('alice')).orders[0]?.status).toBe('executed');
    expect((await game.getPortfolio('alice')).summary.cashILS).toBe('950000.00');
    expect((await game.getLeaderboard(1, '2026-10-05')).total).toBe(1);
    await expect(game.submitOrder('alice', { worldId: world.id, instrumentId: 'AAPL', side: 'buy', amountILS: '100' }, 'after-end-request')).rejects.toMatchObject({ code: 'DATASET_FINISHED' });
  });

  it('coalesces simultaneous readers and does not settle the same pending order twice', async () => {
    const { clock, world, game, elapse, store, now } = await fixture();
    const pending = await game.submitOrder('alice', { worldId: world.id, instrumentId: 'AMZN', side: 'buy', amountILS: '50000' }, 'parallel-amazon-request');
    elapse(Date.parse(pending.executeAt) - Date.parse(world.now));
    const workers = [clock, new WorldClockService(store, game, dataset, { now })];
    await Promise.all(Array.from({ length: 12 }, (_, index) => workers[index % workers.length]!.synchronize()));
    await drain(clock);
    expect((await game.getPortfolio('alice')).summary.cashILS).toBe('950000.00');
    expect((await game.getOrders('alice')).orders).toHaveLength(1);
  });

  it('keeps failed synchronization visible, persists retry cooldown and resumes after a transient database failure', async () => {
    const base = new MemoryStore();
    let fail = false;
    const store: DocumentStore = { get: path => base.get(path), list: (path, options) => base.list(path, options),
      transaction: work => base.transaction(tx => work({ get: path => tx.get(path), set: (path, value) => {
        if (fail && path.endsWith('/players/alice')) { fail = false; throw new Error('injected transient write failure'); }
        tx.set(path, value);
      } })) };
    let milliseconds = initialServerTime;
    const now = () => new Date(milliseconds);
    const game = new GameService(store, dataset, { now });
    const clock = new WorldClockService(store, game, dataset, { now, logger: () => undefined });
    const world = await game.getWorld();
    await game.initialize('alice', 'Alice');
    await clock.getWorld();
    const pending = await game.submitOrder('alice', { worldId: world.id, instrumentId: 'AMZN', side: 'buy', amountILS: '50000' }, 'transient-amazon-request');
    milliseconds += Date.parse(pending.executeAt) - Date.parse(world.now);
    fail = true;
    await clock.synchronize();
    const failed = await clock.getWorld();
    expect(failed.clock).toMatchObject({ syncing: true, error: 'PROCESSING_FAILED' });
    expect(failed.job?.nextRetryAt).toBe(new Date(milliseconds + 15_000).toISOString());
    clock.invalidate();
    await clock.synchronize();
    expect((await clock.getWorld()).job).toEqual(failed.job);
    milliseconds += 15_000;
    const recreated = new WorldClockService(store, game, dataset, { now });
    await drain(recreated);
    expect((await game.getPortfolio('alice')).summary.cashILS).toBe('950000.00');
    expect((await game.getOrders('alice')).orders[0]?.status).toBe('executed');
  });
});

describe('clock API access and isolated test realm', () => {
  it('protects changes and headers, while an authenticated player can trigger server-authorized catch-up', async () => {
    const { store, game, clock, world, elapse, now } = await fixture();
    const realm = scopedStore(store, 'testRealms/admin/');
    const testGame = new GameService(realm, dataset, { now });
    const testServices: GameServices = { game: testGame, clock: new WorldClockService(realm, testGame, dataset, { now }) };
    const app = createApp({ game, clock, testRealmServices: () => testServices,
      verifyToken: async token => ({ uid: token }), adminUids: new Set(['admin']), corsOrigins: [], logger: () => undefined });
    await request(app).get('/api/world').expect(401);
    await request(app).get('/api/world').set('Authorization', 'Bearer alice').set('X-Stockyllix-Test', 'true').expect(403);
    await request(app).post('/api/admin/clock/configure').set('Authorization', 'Bearer alice').set('Idempotency-Key', randomUUID())
      .send({ worldId: world.id, action: 'pause' }).expect(403);
    await request(app).get('/api/admin/clock/audit').set('Authorization', 'Bearer alice').expect(403);
    const original = await store.get(`worlds/${world.id}`);
    const testWorld = await request(app).get('/api/world').set('Authorization', 'Bearer admin').set('X-Stockyllix-Test', 'true').expect(200);
    expect(testWorld.body.testRealm).toBe(true);
    expect(testWorld.body.world.id).not.toBe(world.id);
    expect(await store.get(`worlds/${world.id}`)).toEqual(original);
    const pending = await game.submitOrder('alice', { worldId: world.id, instrumentId: 'AMZN', side: 'buy', amountILS: '50000' }, 'reader-amazon-request');
    elapse(Date.parse(pending.executeAt) - Date.parse(world.now));
    for (let index = 0; index < 10; index += 1) {
      clock.invalidate();
      const response = await request(app).get('/api/world').set('Authorization', 'Bearer alice').expect(200);
      if (!response.body.world.clock.syncing) break;
    }
    expect((await game.getOrders('alice')).orders[0]?.status).toBe('executed');
    expect(await testGame.getOrders('admin')).toMatchObject({ orders: [] });
  });
});
