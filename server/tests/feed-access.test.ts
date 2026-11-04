import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/api/app.js';
import { readConfig } from '../src/config.js';
import { MemoryStore } from '../src/data/memory-store.js';
import { GameService } from '../src/services/game-service.js';
import { createDataset } from '../src/world/index.js';
import type { CurrentMarketResponse } from '../src/feeds/current-market.js';

function setup(access: 'admin' | 'public' = 'admin') {
  const game = new GameService(new MemoryStore(), createDataset('feed-api-isolation'));
  const get = vi.fn(async (): Promise<CurrentMarketResponse> => ({
    mode: 'current', source: 'yahoo', session: 'regular', extendedHoursIncluded: false,
    quotes: [], fetchedAt: null, stale: true, refreshing: false,
    nextRefreshAt: '2026-11-04T10:00:00Z', failureCode: null, status: 'unavailable',
  }));
  const app = createApp({ game, currentMarket: { get }, currentMarketAccess: access,
    adminUids: new Set(['owner']), corsOrigins: [], rateLimitEnabled: false,
    verifyToken: async token => ({ uid: token }), logger: () => undefined });
  return { app, game, get };
}

describe('feed access and world isolation', () => {
  it('rejects unauthenticated and ordinary-user preview calls before contacting the source', async () => {
    const { app, get } = setup();
    expect((await request(app).get('/api/market/current')).status).toBe(401);
    expect((await request(app).get('/api/market/current').auth('player', { type: 'bearer' })).status).toBe(403);
    expect((await request(app).get('/api/news').auth('player', { type: 'bearer' })).status).toBe(403);
    expect(get).not.toHaveBeenCalled();
  });

  it('serves current quotes without changing the game clock or requiring a portfolio', async () => {
    const { app, game, get } = setup();
    const before = await game.getWorld();
    const response = await request(app).get('/api/market/current').auth('owner', { type: 'bearer' });
    expect(response.status).toBe(200);
    expect(response.body.access).toBe('admin');
    expect(get).toHaveBeenCalledOnce();
    expect(await game.getWorld()).toEqual(before);
  });

  it('allows ordinary users only when public access has been explicitly configured', async () => {
    const { app } = setup('public');
    expect((await request(app).get('/api/market/current').auth('player', { type: 'bearer' })).status).toBe(200);
    expect(() => readConfig({ CURRENT_MARKET_ACCESS: 'public' })).toThrow(/permissions/);
    expect(() => readConfig({ NEWS_ACCESS: 'public' })).toThrow(/permissions/);
    expect(readConfig({ CURRENT_MARKET_ACCESS: 'public', CURRENT_MARKET_PUBLIC_USE_CONFIRMED: 'true' }).CURRENT_MARKET_ACCESS).toBe('public');
  });
});
