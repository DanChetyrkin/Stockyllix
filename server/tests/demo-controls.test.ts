import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp, type GameServices } from '../src/api/app.js';
import { MemoryStore } from '../src/data/memory-store.js';
import { scopedStore } from '../src/data/scoped-store.js';
import type { DocumentStore } from '../src/data/store.js';
import type { Dataset } from '../src/domain/model.js';
import { GameService } from '../src/services/game-service.js';
import { TestSimulationService } from '../src/services/test-simulation-service.js';
import { WorldClockService } from '../src/services/world-clock.js';
import { buildSession, createDataset } from '../src/world/index.js';
import { DatasetRegistry } from '../src/world/registry.js';
import { createTestSimulation } from '../src/world/test-simulation.js';

const legacy = createDataset('demo-controls-main-fixture');
const history: Dataset = {
  ...createDataset('demo-controls-history-fixture'),
  id: 'historical-controls-fixture',
  source: 'historical',
  sourceDescription: 'Historical test fixture; not provider prices',
};

async function fixture(maxSteps = 500) {
  const store = new MemoryStore();
  const registry = new DatasetRegistry(legacy, [history]);
  let time = Date.parse('2026-11-04T12:00:00Z');
  const now = () => new Date(time);
  const services = (targetStore: DocumentStore, targetRegistry: DatasetRegistry): GameServices => {
    const game = new GameService(targetStore, targetRegistry, { now });
    return {
      game,
      clock: new WorldClockService(targetStore, game, targetRegistry, { now, autostart: false, maxSteps }),
    };
  };
  const main = services(store, registry);
  const makeTestRealm = async (uid: string) => {
    const testStore = scopedStore(store, `testRealms/${uid}/`);
    const testRegistry = registry.fork();
    const simulations = new TestSimulationService(testStore, testRegistry);
    await simulations.hydrate();
    return { ...services(testStore, testRegistry), simulations };
  };
  const testRealms = new Map<string, Promise<GameServices>>();
  const testRealmServices = (uid: string) => {
    const existing = testRealms.get(uid);
    if (existing) return existing;
    const realm = makeTestRealm(uid);
    testRealms.set(uid, realm);
    return realm;
  };
  let test = await testRealmServices('administrator');
  const app = createApp({
    ...main,
    testRealmServices,
    rateLimitEnabled: false,
    corsOrigins: [],
    adminUids: new Set(['administrator']),
    reviewerUids: new Set(['reviewer', 'second-reviewer']),
    verifyToken: async token => ({ uid: token }),
    logger: () => {},
  });
  return {
    app,
    store,
    registry,
    main,
    get test() {
      return test;
    },
    now,
    elapse: (elapsed: number) => {
      time += elapsed;
    },
    restartTestRealm: async () => {
      testRealms.delete('administrator');
      test = await testRealmServices('administrator');
      return test;
    },
  };
}

async function drain(clock: WorldClockService) {
  for (let index = 0; index < 1000; index += 1) {
    clock.invalidate();
    await clock.synchronize();
    if (!(await clock.getWorld()).clock.syncing) return;
  }
  throw new Error('clock did not settle');
}

const admin = (app: ReturnType<typeof createApp>, path: string) =>
  request(app).get(path).auth('administrator', { type: 'bearer' });

describe('precise shared clock targets and recovery receipts', () => {
  it('reports the next market event, executes pending orders there and ignores a repeated request key', async () => {
    const { main } = await fixture();
    const { game, clock } = main;
    const world = await game.getWorld();
    await Promise.all(['administrator', 'bob'].map(uid => game.initialize(uid, uid)));
    await clock!.getWorld();
    await game.submitOrder(
      'administrator',
      { worldId: world.id, instrumentId: 'AMZN', side: 'buy', amountILS: '50000' },
      randomUUID(),
    );
    await game.submitOrder(
      'bob',
      { worldId: world.id, instrumentId: 'LUMI.TA', side: 'buy', amountILS: '10000' },
      randomUUID(),
    );
    expect(await clock!.targets()).toEqual({
      worldId: world.id,
      gameNow: new Date(world.now).toISOString(),
      nextMarketEvent: { at: '2026-10-05T07:00:00Z', kind: 'MARKET_OPEN', market: 'TA' },
    });
    const key = randomUUID();
    await clock!.configure('administrator', { worldId: world.id, action: 'next' }, key);
    await drain(clock!);
    expect((await game.getOrders('bob')).orders[0]?.status).toBe('executed');
    expect((await game.getOrders('administrator')).orders[0]?.status).toBe('pending');
    expect((await clock!.targets()).nextMarketEvent).toMatchObject({ kind: 'MARKET_OPEN', market: 'US' });
    const auditCount = (await clock!.audit()).entries.length;
    await clock!.configure('administrator', { worldId: world.id, action: 'next' }, key);
    expect((await clock!.audit()).entries).toHaveLength(auditCount);
    await clock!.configure('administrator', { worldId: world.id, action: 'next' }, randomUUID());
    await drain(clock!);
    expect((await game.getOrders('administrator')).orders[0]?.status).toBe('executed');
  });

  it('looks up accepted and unknown receipts without writes, pumping work or replaying a request', async () => {
    const { app, store, main } = await fixture(1);
    const world = await main.game.getWorld();
    const key = randomUUID();
    await main.clock!.configure(
      'administrator',
      { worldId: world.id, action: 'set', targetIsrael: { date: '2026-10-06', time: '11:15' } },
      key,
    );
    const writes = store.operations.writes;
    const current = await main.game.getWorld();
    const receipt = await admin(app, `/api/admin/clock/requests/${key}?worldId=${world.id}`);
    expect(receipt.status).toBe(200);
    expect(receipt.body).toMatchObject({
      accepted: true,
      worldId: world.id,
      action: 'set',
      target: '2026-10-06T08:15:00.000Z',
      processingStatus: 'syncing',
    });
    expect(await main.game.getWorld()).toEqual(current);
    expect(store.operations.writes).toBe(writes);
    const unknown = await admin(app, `/api/admin/clock/requests/${randomUUID()}?worldId=${world.id}`);
    expect(unknown.body.accepted).toBe(false);
    expect(store.operations.writes).toBe(writes);
    await drain(main.clock!);
    expect((await main.clock!.requestStatus(key, world.id)).processingStatus).toBe('completed');
    await main.clock!.configure('administrator', { worldId: world.id, action: 'resume' }, randomUUID());
    expect((await main.clock!.requestStatus(key, world.id)).processingStatus).toBe('superseded');
  });

  it('keeps receipts visible after selecting another world and protects all new endpoints', async () => {
    const { app, main } = await fixture();
    const world = await main.game.getWorld();
    const key = randomUUID();
    await main.clock!.configure('administrator', { worldId: world.id, action: 'pause' }, key);
    await main.game.reset(randomUUID(), world.id, history.id);
    expect((await admin(app, `/api/admin/clock/requests/${key}?worldId=${world.id}`)).body).toMatchObject({
      accepted: true,
      worldId: world.id,
      action: 'pause',
    });
    for (const path of ['/api/admin/clock/targets', `/api/admin/clock/requests/${key}`]) {
      expect((await request(app).get(path).auth('bob', { type: 'bearer' })).status).toBe(403);
      expect((await request(app).get(path)).status).toBe(401);
    }
    expect(
      (
        await request(app)
          .post('/api/admin/clock/configure')
          .auth('bob', { type: 'bearer' })
          .set('Idempotency-Key', randomUUID())
          .send({ worldId: world.id, action: 'next' })
      ).status,
    ).toBe(403);
  });

  it('parses Israel local time and rejects skipped and repeated daylight-saving minutes', async () => {
    const { main } = await fixture();
    const world = await main.game.getWorld();
    await expect(
      main.clock!.configure(
        'administrator',
        { worldId: world.id, action: 'set', targetIsrael: { date: '2026-10-25', time: '01:30' } },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'AMBIGUOUS_ISRAEL_TIME' });
    const simulation = createTestSimulation('2027-03-01', 'a'.repeat(64)).dataset;
    const testStore = new MemoryStore();
    const game = new GameService(testStore, simulation);
    const clock = new WorldClockService(testStore, game, simulation, { autostart: false });
    const testWorld = await game.getWorld();
    await expect(
      clock.configure(
        'administrator',
        { worldId: testWorld.id, action: 'set', targetIsrael: { date: '2027-03-26', time: '02:30' } },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_ISRAEL_TIME' });
    await clock.configure(
      'administrator',
      { worldId: testWorld.id, action: 'set', targetIsrael: { date: '2027-03-26', time: '10:00' } },
      randomUUID(),
    );
    await drain(clock);
    expect((await clock.getWorld()).clock.targetNow).toBe('2027-03-26T07:00:00.000Z');
  });
});

describe('reviewer realm permissions', () => {
  it('allows ordinary shared play and scopes admin controls and job details to the reviewer test realm', async () => {
    const { app, main, store } = await fixture(1);
    const shared = await main.game.getWorld();
    const sharedWorld = await request(app).get('/api/world').auth('reviewer', { type: 'bearer' }).expect(200);
    expect(sharedWorld.body).toMatchObject({ isAdmin: false, canUseTestRealm: true, testRealm: false });
    await request(app)
      .post('/api/me/initialize')
      .auth('reviewer', { type: 'bearer' })
      .send({ displayName: 'Reviewer' })
      .expect(200);
    await request(app)
      .post('/api/orders')
      .auth('reviewer', { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({ worldId: shared.id, instrumentId: 'AMZN', side: 'buy', amountILS: '50000' })
      .expect(201);

    const ownerKey = randomUUID();
    const owner = await request(app)
      .post('/api/admin/clock/configure')
      .auth('administrator', { type: 'bearer' })
      .set('Idempotency-Key', ownerKey)
      .send({ worldId: shared.id, action: 'set', targetIsrael: { date: '2026-10-06', time: '11:15' } })
      .expect(200);
    const jobId = owner.body.world.job.id;
    const receipt = `/api/admin/clock/requests/${ownerKey}?worldId=${shared.id}`;
    expect((await admin(app, receipt).expect(200)).body.accepted).toBe(true);
    const writes = store.operations.writes;
    for (const path of ['/api/admin/clock/targets', '/api/admin/clock/audit', '/api/admin/datasets', receipt]) {
      await request(app).get(path).auth('reviewer', { type: 'bearer' }).expect(403);
    }
    await request(app)
      .post(`/api/admin/clock/jobs/${jobId}/step`)
      .auth('reviewer', { type: 'bearer' })
      .expect(403);
    await request(app)
      .post('/api/admin/clock/configure')
      .auth('reviewer', { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({ worldId: shared.id, action: 'pause' })
      .expect(403);
    await request(app)
      .post('/api/admin/reset')
      .auth('reviewer', { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({ worldId: shared.id, confirmation: 'RESET', datasetId: history.id })
      .expect(403);
    expect(store.operations.writes).toBe(writes);
    const duringSync = await request(app).get('/api/world').auth('reviewer', { type: 'bearer' }).expect(200);
    expect(duringSync.body.world).toMatchObject({ job: null, clock: { syncing: true } });
    expect((await admin(app, '/api/world').expect(200)).body.world.job.id).toBe(jobId);

    await request(app).get('/api/world').auth('bob', { type: 'bearer' }).set('X-Stockyllix-Test', 'true').expect(403);
    const testWorld = await request(app)
      .get('/api/world')
      .auth('reviewer', { type: 'bearer' })
      .set('X-Stockyllix-Test', 'true')
      .expect(200);
    expect(testWorld.body).toMatchObject({ isAdmin: true, canUseTestRealm: true, testRealm: true });
    const created = await request(app)
      .post('/api/admin/reset')
      .auth('reviewer', { type: 'bearer' })
      .set('X-Stockyllix-Test', 'true')
      .set('Idempotency-Key', randomUUID())
      .send({ worldId: testWorld.body.world.id, confirmation: 'RESET', datasetId: history.id })
      .expect(201);
    await request(app)
      .post('/api/admin/clock/configure')
      .auth('reviewer', { type: 'bearer' })
      .set('X-Stockyllix-Test', 'true')
      .set('Idempotency-Key', randomUUID())
      .send({ worldId: created.body.id, action: 'next' })
      .expect(200);
    const other = await request(app)
      .get('/api/world')
      .auth('second-reviewer', { type: 'bearer' })
      .set('X-Stockyllix-Test', 'true')
      .expect(200);
    expect(other.body.world.id).not.toBe(created.body.id);
    expect(await main.game.getWorld()).toMatchObject({ id: shared.id, job: { id: jobId } });
  });
});

describe('isolated deterministic simulation worlds', () => {
  it('preserves every legacy output byte and produces stable positive simulated prices and FX across both March DST changes', () => {
    const original = createDataset('demo-controls-legacy-regression');
    expect(original.id).toBe('demo-oct2026-3559d9346a6d');
    expect(createHash('sha256').update(JSON.stringify(original)).digest('hex')).toBe(
      '80fcfdd7086cf0193c0f3872e1eaea5a090c06cacc86000c13b00b6ff6676f53',
    );
    const first = createTestSimulation('2027-03-01', 'b'.repeat(64));
    expect(createTestSimulation('2027-03-01', 'b'.repeat(64))).toEqual(first);
    expect(first.dataset.source).toBe('simulated');
    expect(first.dataset.sourceDescription).toContain('all stock prices and USD/ILS rates are simulated');
    expect(first.dataset.startsAt).toBe('2027-02-28T22:00:00Z');
    expect(first.dataset.endsAt).toBe('2027-03-28T20:59:59.999Z');
    expect(buildSession('2027-03-12', 'US')?.opensAt).toBe('2027-03-12T14:30:00Z');
    expect(buildSession('2027-03-15', 'US')?.opensAt).toBe('2027-03-15T13:30:00Z');
    expect(buildSession('2027-03-25', 'TA')?.opensAt).toBe('2027-03-25T08:00:00Z');
    expect(buildSession('2027-03-26', 'TA')?.opensAt).toBe('2027-03-26T07:00:00Z');
    expect(first.dataset.instruments).toHaveLength(20);
    for (const event of first.dataset.events) {
      expect(Number(event.snapshot.fx)).toBeGreaterThan(0);
      for (const price of Object.values(event.snapshot.prices)) expect(Number(price)).toBeGreaterThan(0);
    }
    expect(() => createTestSimulation('2027-02-30', 'b'.repeat(64))).toThrow();
    expect(() => createTestSimulation('2100-01-01', 'b'.repeat(64))).toThrow();
  });

  it('creates only in an admin test realm, preserves shared data, and restores exact prices and fills after recreation', async () => {
    const setup = await fixture();
    const { app, store, main, registry } = setup;
    const mainWorld = await main.game.getWorld();
    await main.game.initialize('bob', 'Bob');
    const before = {
      world: await store.get(`worlds/${mainWorld.id}`),
      portfolio: await store.get(`worlds/${mainWorld.id}/players/bob`),
    };
    const originalTestWorld = await setup.test.game.getWorld();
    const key = randomUUID();
    const input = { worldId: originalTestWorld.id, confirmation: 'RESET', simulation: { startDate: '2027-03-01' } };
    expect(
      (
        await request(app)
          .post('/api/admin/reset')
          .auth('administrator', { type: 'bearer' })
          .set('Idempotency-Key', randomUUID())
          .send({ ...input, worldId: mainWorld.id })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/admin/reset')
          .auth('bob', { type: 'bearer' })
          .set('X-Stockyllix-Test', 'true')
          .set('Idempotency-Key', randomUUID())
          .send(input)
      ).status,
    ).toBe(403);
    const created = await request(app)
      .post('/api/admin/reset')
      .auth('administrator', { type: 'bearer' })
      .set('X-Stockyllix-Test', 'true')
      .set('Idempotency-Key', key)
      .send(input);
    expect(created.status).toBe(201);
    expect(created.body.source).toBe('simulated');
    expect(created.body).not.toHaveProperty('seed');
    expect(created.body).not.toHaveProperty('events');
    expect(() => registry.get(created.body.datasetId)).toThrow();
    const descriptor = await store.get(`testRealms/administrator/testDatasets/${created.body.datasetId}`);
    expect(descriptor).toMatchObject({ generatorVersion: 1, days: 28, startDate: '2027-03-01' });
    const retried = await request(app)
      .post('/api/admin/reset')
      .auth('administrator', { type: 'bearer' })
      .set('X-Stockyllix-Test', 'true')
      .set('Idempotency-Key', key)
      .send(input);
    expect(retried.body.id).toBe(created.body.id);
    await setup.test.game.initialize('administrator', 'Administrator');
    await setup.test.clock!.getWorld();
    const pending = await setup.test.game.submitOrder(
      'administrator',
      { worldId: created.body.id, instrumentId: 'AMZN', side: 'buy', amountILS: '50000' },
      randomUUID(),
    );
    const priorMarket = await setup.test.game.getMarket();
    const restarted = await setup.restartTestRealm();
    expect((await restarted.game.getWorld()).id).toBe(created.body.id);
    expect(await restarted.game.getMarket()).toEqual(priorMarket);
    // the simulated game starts before tel aviv opens; the us order fills at the second market event.
    for (let jumps = 0; jumps < 2; jumps += 1) {
      await restarted.clock!.configure('administrator', { worldId: created.body.id, action: 'next' }, randomUUID());
      await drain(restarted.clock!);
    }
    expect((await restarted.game.getOrders('administrator')).orders[0]).toMatchObject({
      id: pending.id,
      status: 'executed',
    });
    expect((await restarted.game.getPortfolio('administrator')).summary.cashILS).toBe('950000.00');
    expect(await store.get(`worlds/${mainWorld.id}`)).toEqual(before.world);
    expect(await store.get(`worlds/${mainWorld.id}/players/bob`)).toEqual(before.portfolio);
    const datasets = await admin(app, '/api/admin/datasets').set('X-Stockyllix-Test', 'true');
    expect(datasets.body.simulationAllowed).toBe(true);
    expect(JSON.stringify(datasets.body)).not.toContain('seed');
    expect((await admin(app, '/api/admin/datasets')).body.simulationAllowed).toBe(false);
  });

  it('rejects altered idempotent simulation requests, arbitrary seeds and shared simulated dataset selection', async () => {
    const setup = await fixture();
    const world = await setup.test.game.getWorld();
    const key = randomUUID();
    await setup.test.simulations!.create(setup.test.game, 'administrator', key, world.id, '2027-03-01');
    await expect(
      setup.test.simulations!.create(setup.test.game, 'administrator', key, world.id, '2027-03-02'),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    const mainWorld = await setup.main.game.getWorld();
    expect(
      (
        await request(setup.app)
          .post('/api/admin/reset')
          .auth('administrator', { type: 'bearer' })
          .set('Idempotency-Key', randomUUID())
          .send({ worldId: mainWorld.id, confirmation: 'RESET', datasetId: legacy.id })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(setup.app)
          .post('/api/admin/reset')
          .auth('administrator', { type: 'bearer' })
          .set('X-Stockyllix-Test', 'true')
          .set('Idempotency-Key', randomUUID())
          .send({ worldId: world.id, confirmation: 'RESET', simulation: { startDate: '2027-03-01', seed: 'forged' } })
      ).status,
    ).toBe(400);
    expect((await setup.main.game.getWorld()).id).toBe(mainWorld.id);
  });

  it('makes prices available to a concurrent reader as soon as the new-world pointer commits', async () => {
    const store = new MemoryStore();
    const registry = new DatasetRegistry(legacy, [history]);
    const game = new GameService(store, registry);
    const world = await game.getWorld();
    let observedDatasetId: string | null = null;
    const observedStore: DocumentStore = {
      get: path => store.get(path),
      list: (path, options) => store.list(path, options),
      transaction: async work => {
        const result = await store.transaction(work);
        // another request can read the pointer before create() resumes after commit.
        observedDatasetId = (await game.getWorld()).datasetId;
        return result;
      },
    };
    const simulations = new TestSimulationService(observedStore, registry);
    const created = await simulations.create(game, 'administrator', randomUUID(), world.id, '2027-03-01');
    expect(observedDatasetId).toBe(created.datasetId);
    expect(registry.get(created.datasetId).source).toBe('simulated');
  });
});
