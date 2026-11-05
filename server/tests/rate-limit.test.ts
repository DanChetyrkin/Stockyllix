import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/api/app.js';
import { MemoryStore } from '../src/data/memory-store.js';
import { GameService } from '../src/services/game-service.js';
import { createDataset } from '../src/world/index.js';

async function setup(rateLimitEnabled = true) {
  const game = new GameService(new MemoryStore(), createDataset('rate-limit-test-seed'));
  const world = await game.getWorld();
  const app = createApp({
    game,
    adminUids: new Set(['administrator']),
    corsOrigins: [],
    rateLimitEnabled,
    verifyToken: async token => ({ uid: token }),
    logger: () => undefined,
  });
  return {
    app,
    game,
    stepResult: { worldId: world.id, revision: world.revision, status: world.status, job: world.job },
  };
}

describe('rate limits for shared networks and clock processing', () => {
  it('does not accumulate successful requests from different players behind one IP', async () => {
    const { app } = await setup();
    for (let index = 0; index < 200; index += 1) {
      const response = await request(app).get('/api/world').auth(`player-${index}`, { type: 'bearer' });
      expect(response.status).toBe(200);
    }
  }, 20_000);

  it('limits each verified player independently after 180 ordinary requests', async () => {
    const { app } = await setup();
    for (let index = 0; index < 180; index += 1) {
      expect((await request(app).get('/api/world').auth('alice', { type: 'bearer' })).status).toBe(200);
    }
    const blocked = await request(app).get('/api/world').auth('alice', { type: 'bearer' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatchObject({ code: 'RATE_LIMITED', retryable: true });
    expect(blocked.headers['retry-after']).toBeTruthy();
    expect((await request(app).get('/api/world').auth('bob', { type: 'bearer' })).status).toBe(200);
  }, 20_000);

  it('gives verified admin steps an independent bucket without boosting ordinary or inexact routes', async () => {
    const { app, game, stepResult } = await setup();
    const step = vi.spyOn(game, 'step').mockResolvedValue(stepResult);
    for (let index = 0; index < 200; index += 1) {
      expect(
        (await request(app).post('/api/admin/clock/jobs/demo-job/step').auth('administrator', { type: 'bearer' }))
          .status,
      ).toBe(200);
    }
    expect(step).toHaveBeenCalledTimes(200);
    // the clock calls leave the full ordinary API allowance available.
    for (let index = 0; index < 180; index += 1) {
      expect((await request(app).get('/api/world').auth('administrator', { type: 'bearer' })).status).toBe(200);
    }
    expect((await request(app).get('/api/world').auth('administrator', { type: 'bearer' })).status).toBe(429);
    expect(
      (await request(app).post('/api/admin/clock/jobs/demo-job/step/extra').auth('administrator', { type: 'bearer' }))
        .status,
    ).toBe(429);
    expect(
      (await request(app).get('/api/admin/clock/jobs/demo-job/step').auth('administrator', { type: 'bearer' })).status,
    ).toBe(429);
    expect(
      (await request(app).post('/api/admin/clock/jobs/demo-job/step').auth('administrator', { type: 'bearer' })).status,
    ).toBe(200);
    expect(step).toHaveBeenCalledTimes(201);
  }, 20_000);

  it('never grants the clock allowance to an ordinary player', async () => {
    const { app, game, stepResult } = await setup();
    const step = vi.spyOn(game, 'step').mockResolvedValue(stepResult);
    const forbidden = await request(app).post('/api/admin/clock/jobs/demo-job/step').auth('alice', { type: 'bearer' });
    expect(forbidden.status).toBe(403);
    for (let index = 0; index < 179; index += 1) {
      expect((await request(app).get('/api/world').auth('alice', { type: 'bearer' })).status).toBe(200);
    }
    expect(
      (await request(app).post('/api/admin/clock/jobs/demo-job/step').auth('alice', { type: 'bearer' })).status,
    ).toBe(429);
    expect(step).not.toHaveBeenCalled();
  }, 20_000);

  it('retains the coarse IP limit for unauthenticated attempts', async () => {
    const { app } = await setup();
    for (let index = 0; index < 180; index += 1) {
      expect((await request(app).get('/api/world')).status).toBe(401);
    }
    const blocked = await request(app).get('/api/world');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  }, 20_000);

  it('bypasses both guards only when rate limiting is explicitly disabled', async () => {
    const { app } = await setup(false);
    for (let index = 0; index < 181; index += 1) {
      expect((await request(app).get('/api/world').auth('alice', { type: 'bearer' })).status).toBe(200);
      expect((await request(app).get('/api/world')).status).toBe(401);
    }
  }, 20_000);
});
