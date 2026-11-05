import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/api/app.js';
import { MemoryStore } from '../src/data/memory-store.js';
import { GameService } from '../src/services/game-service.js';
import { createDataset } from '../src/world/index.js';

function setup() {
  const store = new MemoryStore();
  const dataset = createDataset('api-test-seed');
  const game = new GameService(store, dataset);
  const logs: Record<string, unknown>[] = [];
  const app = createApp({
    game, corsOrigins: ['http://localhost:8081'], adminUids: new Set(['administrator']),
    rateLimitEnabled: false,
    verifyToken: async (token) => {
      if (!['alice', 'bob', 'administrator'].includes(token)) throw new Error('invalid token');
      return { uid: token };
    },
    logger: (entry) => { logs.push(entry); },
  });
  return { app, game, dataset, logs };
}

describe('authenticated game api', () => {
  it('keeps health public and protects all game routes', async () => {
    const { app } = setup();
    expect((await request(app).get('/health')).status).toBe(200);
    expect((await request(app).get('/api/world')).status).toBe(401);
    expect((await request(app).get('/api/world').auth('invalid', { type: 'bearer' })).status).toBe(401);
    const world = await request(app).get('/api/world').auth('alice', { type: 'bearer' });
    expect(world.status).toBe(200);
    expect(world.body.isAdmin).toBe(false);
    expect(world.body.world).not.toHaveProperty('snapshot');
    expect(world.body.world).not.toHaveProperty('events');
  });

  it('does not trust client identity, money, execution price or admin flags', async () => {
    const { app } = setup();
    const initialized = await request(app).post('/api/me/initialize').auth('alice', { type: 'bearer' }).send({ displayName: 'Alice' });
    expect(initialized.status).toBe(200);
    expect(initialized.body.cashAgorot).toBe(100_000_000);
    const forged = await request(app).post('/api/me/initialize').auth('bob', { type: 'bearer' }).send({ displayName: 'Bob', cashAgorot: 999999999 });
    expect(forged.status).toBe(400);
    expect((await request(app).post('/api/admin/clock/jobs/any/step').auth('alice', { type: 'bearer' })).status).toBe(403);
    const world = await request(app).get('/api/world').auth('alice', { type: 'bearer' });
    const order = { worldId: world.body.world.id, instrumentId: 'AAPL', side: 'buy', amountILS: '1000' };
    const forgedPrice = await request(app).post('/api/orders').auth('alice', { type: 'bearer' }).set('Idempotency-Key', randomUUID()).send({ ...order, price: '0.01' });
    expect(forgedPrice.status).toBe(400);
  });

  it('requires stable request ids and preserves exactly one order across retries', async () => {
    const { app } = setup();
    await request(app).post('/api/me/initialize').auth('alice', { type: 'bearer' }).send({ displayName: 'Alice' });
    const world = await request(app).get('/api/world').auth('alice', { type: 'bearer' });
    const payload = { worldId: world.body.world.id, instrumentId: 'AAPL', side: 'buy', amountILS: '1000.00' };
    const key = randomUUID();
    const withoutKey = await request(app).post('/api/orders').auth('alice', { type: 'bearer' }).send(payload);
    expect(withoutKey.status).toBe(400);
    const first = await request(app).post('/api/orders').auth('alice', { type: 'bearer' }).set('Idempotency-Key', key).send(payload);
    const retry = await request(app).post('/api/orders').auth('alice', { type: 'bearer' }).set('Idempotency-Key', key).send(payload);
    expect(first.status).toBe(201);
    expect(retry.body.order).toEqual(first.body.order);
    const conflict = await request(app).post('/api/orders').auth('alice', { type: 'bearer' }).set('Idempotency-Key', key).send({ ...payload, amountILS: '2000' });
    expect(conflict.status).toBe(409);
    const orders = await request(app).get('/api/orders').auth('alice', { type: 'bearer' });
    expect(orders.body.orders).toHaveLength(1);
    const bobOrders = await request(app).get('/api/orders').auth('bob', { type: 'bearer' });
    expect(bobOrders.body.orders).toEqual([]);
  });

  it('blocks untrusted browser origins and returns safe errors with request ids', async () => {
    const { app, logs } = setup();
    const blocked = await request(app).get('/api/world').set('Origin', 'https://untrusted.example').auth('alice', { type: 'bearer' });
    expect(blocked.status).toBe(403);
    const invalid = await request(app).post('/api/me/initialize').auth('alice', { type: 'bearer' }).set('Content-Type', 'application/json').send('{invalid');
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.requestId).toBeTruthy();
    expect(JSON.stringify(logs)).not.toContain('Bearer');
  });

  it('provides a resumable admin workflow and rejects game reads during processing', async () => {
    const { app, game, dataset } = setup();
    await request(app).post('/api/me/initialize').auth('alice', { type: 'bearer' }).send({ displayName: 'Alice' });
    const target = dataset.events.find((event) => event.kind === 'MARKET_OPEN')!.at;
    const world = await request(app).get('/api/world').auth('alice', { type: 'bearer' });
    const started = await game.advance(target, randomUUID(), world.body.world.id);
    expect(started.status).toBe('advancing');
    expect((await request(app).get('/api/portfolio').auth('alice', { type: 'bearer' })).status).toBe(423);
    let state: { status: string; job: { id: string } | null } = started;
    for (let attempt = 0; attempt < 15 && state.status !== 'idle'; attempt += 1) {
      const step = await request(app).post(`/api/admin/clock/jobs/${state.job!.id}/step`).auth('administrator', { type: 'bearer' });
      expect(step.status).toBe(200);
      state = step.body;
    }
    expect(state.status).toBe('idle');
    expect((await request(app).get('/api/portfolio').auth('alice', { type: 'bearer' })).status).toBe(200);
    const leaderboard = await request(app).get('/api/leaderboard').auth('alice', { type: 'bearer' });
    expect(leaderboard.body.page).toBe(1);
    expect(leaderboard.body.rows).toHaveLength(1);
    expect((await request(app).get('/api/leaderboard?page=0').auth('alice', { type: 'bearer' })).status).toBe(400);
  });
});
