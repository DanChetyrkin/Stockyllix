import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/api/app.js';
import { MemoryStore } from '../src/data/memory-store.js';
import type { DocumentStore } from '../src/data/store.js';
import { GameService } from '../src/services/game-service.js';
import { ProfileService } from '../src/services/profile-service.js';
import { createDataset } from '../src/world/index.js';

const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=';

function setup() {
  const store = new MemoryStore();
  const game = new GameService(store, createDataset('profile-test'));
  const profile = new ProfileService(store);
  const app = createApp({
    game, profile, corsOrigins: [], adminUids: new Set(), rateLimitEnabled: false,
    verifyToken: async (token) => {
      if (!['alice', 'bob'].includes(token)) throw new Error('invalid token');
      return { uid: token };
    },
    logger: () => {},
  });
  return { store, game, profile, app };
}

describe('private player profiles', () => {
  it('defaults to no photo, trims names and keeps users separate', async () => {
    const { profile } = setup();
    expect(await profile.get('alice')).toEqual({ displayName: '', photoDataUrl: null });
    await profile.save('alice', { displayName: '  Alice  ', photoDataUrl: PHOTO });
    expect(await profile.get('alice')).toEqual({ displayName: 'Alice', photoDataUrl: PHOTO });
    expect(await profile.get('bob')).toEqual({ displayName: '', photoDataUrl: null });
  });

  it('preserves an omitted photo and removes it only when explicitly null', async () => {
    const { profile } = setup();
    await profile.save('alice', { displayName: 'Alice', photoDataUrl: PHOTO });
    expect((await profile.save('alice', { displayName: 'Alice Smith' })).photoDataUrl).toBe(PHOTO);
    expect(await profile.save('alice', { displayName: 'Alice', photoDataUrl: null }))
      .toEqual({ displayName: 'Alice', photoDataUrl: null });
  });

  it('updates the active player name without changing money, holdings or orders', async () => {
    const { game, profile, store } = setup();
    const before = await game.initialize('alice', 'Alice');
    await game.initialize('bob', 'Bob');
    await profile.save('alice', { displayName: 'New name', photoDataUrl: PHOTO });
    const world = await game.getWorld();
    expect(await store.get(`worlds/${world.id}/players/alice`)).toEqual({ ...before, displayName: 'New name' });
    const bob = await store.get<{ displayName: string }>(`worlds/${world.id}/players/bob`);
    expect(bob?.displayName).toBe('Bob');
  });

  it.each(['', ' A ', 'x'.repeat(41)])('rejects invalid name %j before writing', async (displayName) => {
    const { profile, store } = setup();
    await expect(profile.save('alice', { displayName })).rejects.toMatchObject({ code: 'INVALID_DISPLAY_NAME' });
    expect(store.operations.writes).toBe(0);
  });

  it.each([
    'https://example.com/photo.png',
    'data:image/svg+xml;base64,PHN2Zy8+',
    'data:image/png;base64,bm90IGEgcG5n',
    'data:image/jpeg;base64,aGVsbG8=',
    PHOTO.replace('iVBOR', 'i VBOR'),
    `data:image/png;base64,${Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(32 * 1024)]).toString('base64')}`,
  ])('rejects unsafe, malformed or oversized images before writing', async (photoDataUrl) => {
    const { profile, store } = setup();
    await expect(profile.save('alice', { displayName: 'Alice', photoDataUrl })).rejects.toMatchObject({ code: 'INVALID_PROFILE_PHOTO' });
    expect(store.operations.writes).toBe(0);
  });

  it('rolls back both profile and player when a write fails', async () => {
    const { store, game } = setup();
    const before = await game.initialize('alice', 'Alice');
    const failingStore: DocumentStore = {
      get: store.get.bind(store), list: store.list.bind(store),
      transaction: (work) => store.transaction((tx) => work({
        get: tx.get,
        set: (path, value) => {
          tx.set(path, value);
          if (path.includes('/players/')) throw new Error('temporary write failure');
        },
      })),
    };
    await expect(new ProfileService(failingStore).save('alice', { displayName: 'New name', photoDataUrl: PHOTO }))
      .rejects.toThrow('temporary write failure');
    expect(await store.get('profiles/alice')).toBeUndefined();
    const world = await game.getWorld();
    expect(await store.get(`worlds/${world.id}/players/alice`)).toEqual(before);
  });
});

describe('profile api', () => {
  it('requires authentication and derives ownership from the verified token', async () => {
    const { app } = setup();
    expect((await request(app).get('/api/me/profile')).status).toBe(401);
    const forged = await request(app).post('/api/me/profile').auth('alice', { type: 'bearer' })
      .send({ uid: 'bob', displayName: 'Fake Bob' });
    expect(forged.status).toBe(400);
    expect((await request(app).post('/api/me/profile').auth('alice', { type: 'bearer' })
      .send({ displayName: 'Alice', photoDataUrl: PHOTO })).status).toBe(200);
    const bob = await request(app).get('/api/me/profile').auth('bob', { type: 'bearer' });
    expect(bob.body.profile).toEqual({ displayName: '', photoDataUrl: null });
  });

  it('accepts a photo larger than the trading body limit but rejects oversized requests', async () => {
    const { app } = setup();
    const photoDataUrl = `data:image/png;base64,${Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(16 * 1024),
    ]).toString('base64')}`;
    expect((await request(app).post('/api/me/profile').auth('alice', { type: 'bearer' })
      .send({ displayName: 'Alice', photoDataUrl })).status).toBe(200);
    expect((await request(app).post('/api/me/profile').auth('alice', { type: 'bearer' })
      .send({ displayName: 'Alice', photoDataUrl: 'x'.repeat(65 * 1024) })).status).toBe(413);
    expect((await request(app).post('/api/orders').auth('alice', { type: 'bearer' })
      .send({ padding: 'x'.repeat(13 * 1024) })).status).toBe(413);
  });
});
