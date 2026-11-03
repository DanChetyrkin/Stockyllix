import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/api/app.js';
import { MemoryStore } from '../src/data/memory-store.js';
import { BankIsraelService } from '../src/services/bank-israel.js';
import { GameService } from '../src/services/game-service.js';
import type { BoiLatestRate } from '../src/world/boi.js';
import { createDataset } from '../src/world/index.js';

const quote: BoiLatestRate = {
  source: 'boi', rate: '3.1570000000', observedAt: '2026-11-03T13:21:05.866Z', date: '2026-11-03',
  sourceUrl: 'https://www.boi.org.il/PublicApi/GetExchangeRate?key=USD', kind: 'representative',
};
const now = () => new Date('2026-11-04T00:00:00Z');

function setup(bankIsrael?: BankIsraelService) {
  const store = new MemoryStore();
  const logs: Record<string, unknown>[] = [];
  const app = createApp({
    game: new GameService(store, createDataset('bank-israel-api-test')), bankIsrael,
    corsOrigins: [], adminUids: new Set(), rateLimitEnabled: false,
    verifyToken: async token => {
      if (token !== 'alice') throw new Error('invalid token');
      return { uid: token };
    },
    logger: entry => { logs.push(entry); },
  });
  return { app, store, logs };
}

describe('Bank of Israel reference HTTP contract', () => {
  it('requires authentication before contacting the provider', async () => {
    const load = vi.fn(async () => quote);
    const { app } = setup(new BankIsraelService({ load, now }));
    expect((await request(app).get('/api/reference/fx')).status).toBe(401);
    expect((await request(app).get('/api/reference/fx').auth('invalid', { type: 'bearer' })).status).toBe(401);
    expect(load).not.toHaveBeenCalled();
  });

  it('returns the cached official reference quote without creating or changing a game world', async () => {
    const load = vi.fn(async () => quote);
    const { app, store } = setup(new BankIsraelService({ load, now }));
    const response = await request(app).get('/api/reference/fx').auth('alice', { type: 'bearer' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ...quote, fetchedAt: now().toISOString(), stale: false });
    const retry = await request(app).get('/api/reference/fx').auth('alice', { type: 'bearer' });
    expect(retry.body).toEqual(response.body);
    expect(load).toHaveBeenCalledTimes(1);
    expect(await store.get('system/current')).toBeUndefined();
    expect(store.operations.writes).toBe(0);
  });

  it('returns safe retryable 503 responses for missing or failing provider services', async () => {
    const privateDetail = 'private-provider-debug-information';
    const failing = new BankIsraelService({ now, load: async () => { throw new Error(privateDetail); } });
    for (const { app, logs } of [setup(), setup(failing)]) {
      const response = await request(app).get('/api/reference/fx').auth('alice', { type: 'bearer' });
      expect(response.status).toBe(503);
      expect(response.body.error).toMatchObject({ code: 'REFERENCE_FX_UNAVAILABLE', retryable: true });
      expect(response.body.error.requestId).toBeTruthy();
      expect(response.body).not.toHaveProperty('rate');
      expect(response.text).not.toContain(privateDetail);
      expect(JSON.stringify(logs)).not.toContain(privateDetail);
    }
  });
});
