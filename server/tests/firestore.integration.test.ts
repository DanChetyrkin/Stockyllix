import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { afterAll, describe, expect, it } from 'vitest';
import { FirestoreStore } from '../src/data/firestore-store.js';
import type { DocumentStore } from '../src/data/store.js';
import { GameService } from '../src/services/game-service.js';
import { createDataset } from '../src/world/index.js';

const enabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const projectId = 'demo-stockyllix';
const app = enabled ? initializeApp({ projectId }, `integration-${randomUUID()}`) : undefined;
const store = app ? new FirestoreStore(getFirestore(app)) : undefined;
afterAll(async () => { if (app) await deleteApp(app); });

describe.skipIf(!enabled)('real firestore emulator', () => {
  it('retries conflicting updates and rolls back failed transactions', async () => {
    const path = `integration/${randomUUID()}`;
    await store!.transaction(async (tx) => tx.set(path, { count: 0 }));
    await Promise.all(Array.from({ length: 4 }, () => store!.transaction(async (tx) => {
      const current = await tx.get<{ count: number }>(path);
      tx.set(path, { count: current!.count + 1 });
    })));
    expect((await store!.get<{ count: number }>(path))?.count).toBe(4);
    await expect(store!.transaction(async (tx) => {
      tx.set(path, { count: 100 });
      throw new Error('injected crash');
    })).rejects.toThrow('injected crash');
    expect((await store!.get<{ count: number }>(path))?.count).toBe(4);
  }, 30_000);

  it('prevents two actual database transactions from overcommitting one instrument', async () => {
    // isolate this run from a developer's active local demo world
    const prefix = `integrationRuns/${randomUUID()}/`;
    const isolated: DocumentStore = {
      get: (path) => store!.get(prefix + path),
      list: (path, options) => store!.list(prefix + path, options),
      transaction: (work) => store!.transaction((tx) => work({
        get: (path) => tx.get(prefix + path),
        set: (path, value) => tx.set(prefix + path, value),
      })),
    };
    const game = new GameService(isolated, createDataset('firestore-integration'));
    const uid = `integration-${randomUUID()}`;
    const world = await game.getWorld();
    await game.initialize(uid, 'Integration player');
    const input = { worldId: world.id, instrumentId: 'AAPL', side: 'buy' as const, amountILS: '150000' };
    const results = await Promise.allSettled([
      game.submitOrder(uid, input, randomUUID()),
      game.submitOrder(uid, input, randomUUID()),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const portfolio = await game.getPortfolio(uid);
    expect(portfolio.portfolio.reservedCashAgorot).toBe(15_000_000);
    expect(portfolio.portfolio.pendingOrderIds).toHaveLength(1);
  }, 30_000);

  it('denies browser requests even when a real emulator user is authenticated', async () => {
    const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
    expect(authHost).toBeTruthy();
    const signUp = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `test-${randomUUID()}@example.test`, password: 'emulator-test-password', returnSecureToken: true }),
    });
    expect(signUp.ok).toBe(true);
    const identity = await signUp.json() as { idToken: string };
    const path = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/system/current`;
    const anonymous = await fetch(path);
    const signedIn = await fetch(path, { headers: { Authorization: `Bearer ${identity.idToken}` } });
    expect(anonymous.status).toBe(403);
    expect(signedIn.status).toBe(403);
  }, 30_000);
});
