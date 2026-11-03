import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/api/app.js';
import { MemoryStore } from '../src/data/memory-store.js';
import { DailyQuizService } from '../src/services/daily-quiz.js';
import { GameService } from '../src/services/game-service.js';
import { MarketInsightsService } from '../src/services/market-insights.js';
import { PerformanceService } from '../src/services/performance-service.js';
import { ProfileService } from '../src/services/profile-service.js';
import { createDataset } from '../src/world/index.js';

async function setup(extensions = true) {
  const store = new MemoryStore();
  const dataset = createDataset('extensions-api-test-seed');
  const now = () => new Date('2026-11-03T10:00:00Z');
  const game = new GameService(store, dataset, { now });
  const app = createApp({
    game,
    ...(extensions ? {
      profile: new ProfileService(store), insights: new MarketInsightsService(store, dataset, now),
      quiz: new DailyQuizService(store, { now }), performance: new PerformanceService(store, dataset),
    } : {}),
    corsOrigins: ['http://localhost:8081'], adminUids: new Set(['administrator']), rateLimitEnabled: false,
    verifyToken: async token => {
      if (token === 'invalid-uid') return { uid: 'other/user' };
      if (!['alice', 'bob', 'administrator'].includes(token)) throw new Error('invalid token');
      return { uid: token };
    },
    logger: () => undefined,
  });
  const world = await game.getWorld();
  return { app, store, dataset, world };
}

async function advance(app: ReturnType<typeof createApp>, worldId: string, target: string) {
  const started = await request(app).post('/api/admin/clock/advance').auth('administrator', { type: 'bearer' })
    .set('Idempotency-Key', randomUUID()).send({ worldId, target });
  expect(started.status).toBe(202);
  let state = started.body;
  for (let attempt = 0; attempt < 40 && state.status !== 'idle'; attempt += 1) {
    const step = await request(app).post(`/api/admin/clock/jobs/${state.job.id}/step`).auth('administrator', { type: 'bearer' });
    expect(step.status).toBe(200);
    state = step.body;
  }
  expect(state.status).toBe('idle');
  return state;
}

describe('extension HTTP contracts with real services', () => {
  it('requires a verified identity before reading or changing extension data', async () => {
    const { app } = await setup();
    for (const path of ['/api/me/profile', '/api/instruments/LUMI.TA/history', '/api/watchlist', '/api/daily-quiz', '/api/performance']) {
      expect((await request(app).get(path)).status).toBe(401);
      expect((await request(app).get(path).auth('invalid-uid', { type: 'bearer' })).status).toBe(401);
    }
    for (const path of ['/api/me/profile', '/api/watchlist', '/api/watchlist/remove', '/api/daily-quiz/answer']) {
      expect((await request(app).post(path).send({})).status).toBe(401);
    }
    const notInitialized = await request(app).get('/api/performance').auth('bob', { type: 'bearer' });
    expect(notInitialized.status).toBe(404);
    expect(notInitialized.body.error.code).toBe('PLAYER_NOT_INITIALIZED');
  });

  it('accepts a dotted TA ticker and publishes only history reached by the shared clock', async () => {
    const { app, dataset, world } = await setup();
    const opening = dataset.events.find(event => event.kind === 'MARKET_OPEN' && event.market === 'TA')!;
    await advance(app, world.id, opening.at);
    const history = await request(app).get(`/api/instruments/LUMI.TA/history?until=${encodeURIComponent(dataset.endsAt)}`).auth('alice', { type: 'bearer' });
    expect(history.status).toBe(200);
    expect(history.body).toMatchObject({ instrumentId: 'LUMI.TA', currency: 'ILS', dataMode: 'simulated' });
    expect(history.body.latestPrice).toBe(opening.snapshot.prices['LUMI.TA']);
    expect(Date.parse(history.body.asOf)).toBe(Date.parse(opening.at));
    expect(history.body.points).toEqual([
      { at: dataset.startsAt, price: dataset.initialSnapshot.prices['LUMI.TA'], kind: 'baseline' },
      { at: opening.at, price: opening.snapshot.prices['LUMI.TA'], kind: 'open' },
    ]);
    expect(history.body.points.every((point: { at: string }) => Date.parse(point.at) <= Date.parse(history.body.asOf))).toBe(true);
    expect(history.body).not.toHaveProperty('events');
    expect(history.body).not.toHaveProperty('snapshot');
    const us = await request(app).get('/api/instruments/AAPL/history').auth('alice', { type: 'bearer' });
    expect(us.body.points).toHaveLength(1);
    const unknown = await request(app).get('/api/instruments/UNKNOWN/history').auth('alice', { type: 'bearer' });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('UNKNOWN_INSTRUMENT');
  });

  it('upserts and removes private watch targets without placing financial orders', async () => {
    const { app, dataset } = await setup();
    await request(app).post('/api/me/initialize').auth('alice', { type: 'bearer' }).send({ displayName: 'Alice' });
    const input = { instrumentId: 'LUMI.TA', targetPrice: dataset.initialSnapshot.prices['LUMI.TA'], direction: 'at_or_below' };
    const saved = await request(app).post('/api/watchlist').auth('alice', { type: 'bearer' }).send(input);
    expect(saved.status).toBe(200);
    expect(saved.body.instrumentId).toBe('LUMI.TA');
    expect((await request(app).post('/api/watchlist').auth('alice', { type: 'bearer' }).send(input)).status).toBe(200);
    const list = await request(app).get('/api/watchlist').auth('alice', { type: 'bearer' });
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ instrumentId: input.instrumentId, direction: input.direction, reached: true, currency: 'ILS' });
    expect(Number(list.body.items[0].targetPrice)).toBe(Number(input.targetPrice));
    expect((await request(app).get('/api/watchlist').auth('bob', { type: 'bearer' })).body.items).toEqual([]);
    expect((await request(app).post('/api/watchlist/remove').auth('bob', { type: 'bearer' }).send({ instrumentId: 'LUMI.TA' })).status).toBe(200);
    expect((await request(app).get('/api/watchlist').auth('alice', { type: 'bearer' })).body.items).toHaveLength(1);
    const forged = await request(app).post('/api/watchlist').auth('bob', { type: 'bearer' }).send({ ...input, uid: 'alice' });
    expect(forged.status).toBe(400);
    expect((await request(app).get('/api/orders').auth('alice', { type: 'bearer' })).body.orders).toEqual([]);
    const portfolio = await request(app).get('/api/portfolio').auth('alice', { type: 'bearer' });
    expect(portfolio.body.portfolio).toMatchObject({ cashAgorot: 100_000_000, reservedCashAgorot: 0 });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const removed = await request(app).post('/api/watchlist/remove').auth('alice', { type: 'bearer' }).send({ instrumentId: 'LUMI.TA' });
      expect(removed.status).toBe(200);
      expect(removed.body).toEqual({ removed: true });
    }
    expect((await request(app).get('/api/watchlist').auth('alice', { type: 'bearer' })).body.items).toEqual([]);
  });

  it('rejects invalid watch inputs and unknown assets through the public contract', async () => {
    const { app } = await setup();
    const input = { instrumentId: 'AAPL', targetPrice: '10', direction: 'at_or_below' };
    for (const targetPrice of ['-1', 'NaN']) {
      const rejected = await request(app).post('/api/watchlist').auth('alice', { type: 'bearer' }).send({ ...input, targetPrice });
      expect(rejected.status).toBe(422);
      expect(rejected.body.error.code).toBe('INVALID_TARGET');
    }
    expect((await request(app).post('/api/watchlist').auth('alice', { type: 'bearer' }).send({ ...input, direction: 'cancel' })).status).toBe(400);
    const unknown = await request(app).post('/api/watchlist').auth('alice', { type: 'bearer' }).send({ ...input, instrumentId: 'UNKNOWN' });
    expect(unknown.status).toBe(404);
    expect((await request(app).get('/api/watchlist').auth('alice', { type: 'bearer' })).body.items).toEqual([]);
  });

  it('keeps profile photos private and updates only the authenticated player name', async () => {
    const { app } = await setup();
    await request(app).post('/api/me/initialize').auth('alice', { type: 'bearer' }).send({ displayName: 'Alice' });
    const photoDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZQAAAABJRU5ErkJggg==';
    const saved = await request(app).post('/api/me/profile').auth('alice', { type: 'bearer' }).send({ displayName: '  Alice Investor  ', photoDataUrl });
    expect(saved.status).toBe(200);
    expect(saved.body.profile).toEqual({ displayName: 'Alice Investor', photoDataUrl });
    expect((await request(app).get('/api/me/profile').auth('bob', { type: 'bearer' })).body.profile).toEqual({ displayName: '', photoDataUrl: null });
    const portfolio = await request(app).get('/api/portfolio').auth('alice', { type: 'bearer' });
    expect(portfolio.body.portfolio.displayName).toBe('Alice Investor');
    expect(JSON.stringify(portfolio.body)).not.toContain(photoDataUrl);
    const forged = await request(app).post('/api/me/profile').auth('bob', { type: 'bearer' }).send({ uid: 'alice', displayName: 'Other User', photoDataUrl: null });
    expect(forged.status).toBe(400);
    expect((await request(app).get('/api/me/profile').auth('alice', { type: 'bearer' })).body.profile).toEqual(saved.body.profile);
  });

  it('never accepts SVG, disguised content or oversized profile images', async () => {
    const { app } = await setup();
    const original = { displayName: 'Alice', photoDataUrl: null };
    expect((await request(app).post('/api/me/profile').auth('alice', { type: 'bearer' }).send(original)).status).toBe(200);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
    const oversized = Buffer.concat([Buffer.from([255, 216, 255]), Buffer.alloc(32 * 1024 - 2)]).toString('base64');
    for (const photoDataUrl of [`data:image/svg+xml;base64,${svg}`, `data:image/png;base64,${svg}`, `data:image/jpeg;base64,${oversized}`, 'https://example.com/avatar.png']) {
      const rejected = await request(app).post('/api/me/profile').auth('alice', { type: 'bearer' }).send({ displayName: 'Changed Name', photoDataUrl });
      expect(rejected.status).toBe(400);
      expect(rejected.body.error.code).toBe('INVALID_PROFILE_PHOTO');
    }
    const tooLarge = await request(app).post('/api/me/profile').auth('alice', { type: 'bearer' }).send({ displayName: 'Changed Name', photoDataUrl: 'x'.repeat(70_000) });
    expect(tooLarge.status).toBe(413);
    expect((await request(app).get('/api/me/profile').auth('alice', { type: 'bearer' })).body.profile).toEqual(original);
  });

  it('keeps the first daily answer across retries and isolates another player', async () => {
    const { app } = await setup();
    const question = await request(app).get('/api/daily-quiz').auth('alice', { type: 'bearer' });
    expect(question.status).toBe(200);
    expect(question.body.date).toBe('2026-10-05');
    expect(question.body).not.toHaveProperty('nextResetAt');
    expect(question.body.answer).toBeNull();
    expect(question.body.question).not.toHaveProperty('correctIndex');
    expect(question.body.question).not.toHaveProperty('explanation');
    const input = { worldId: question.body.worldId, date: question.body.date, questionId: question.body.question.id, answerIndex: 0 };
    const first = await request(app).post('/api/daily-quiz/answer').auth('alice', { type: 'bearer' }).send(input);
    expect(first.status).toBe(200);
    expect(first.body.answer.answerIndex).toBe(0);
    expect(first.body.answer.explanation).toBeTruthy();
    const retries = await Promise.all([0, 1, 2, 3].map(answerIndex => request(app).post('/api/daily-quiz/answer').auth('alice', { type: 'bearer' }).send({ ...input, answerIndex })));
    for (const retry of retries) { expect(retry.status).toBe(200); expect(retry.body.answer).toEqual(first.body.answer); }
    expect((await request(app).get('/api/daily-quiz').auth('bob', { type: 'bearer' })).body.answer).toBeNull();
    const expired = await request(app).post('/api/daily-quiz/answer').auth('alice', { type: 'bearer' }).send({ ...input, date: '2026-11-02' });
    expect(expired.status).toBe(409);
    expect(expired.body.error.code).toBe('QUIZ_EXPIRED');
    expect((await request(app).post('/api/daily-quiz/answer').auth('alice', { type: 'bearer' }).send({ ...input, answerIndex: 4 })).status).toBe(400);
  });

  it('reports a filled buy for its owner and never accepts a requested alternate identity', async () => {
    const { app, dataset, world } = await setup();
    await request(app).post('/api/me/initialize').auth('alice', { type: 'bearer' }).send({ displayName: 'Alice' });
    await request(app).post('/api/me/initialize').auth('bob', { type: 'bearer' }).send({ displayName: 'Bob' });
    const order = await request(app).post('/api/orders').auth('alice', { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ worldId: world.id, instrumentId: 'AAPL', side: 'buy', amountILS: '10000' });
    expect(order.status).toBe(201);
    const opening = dataset.events.find(event => event.kind === 'MARKET_OPEN' && event.market === 'US')!;
    await advance(app, world.id, opening.at);
    const report = await request(app).get('/api/performance').auth('alice', { type: 'bearer' });
    expect(report.status).toBe(200);
    expect(report.body).toMatchObject({ worldId: world.id, realizedILS: '0.00', dataMode: 'simulated' });
    expect(Date.parse(report.body.asOf)).toBe(Date.parse(opening.at));
    expect(report.body.holdings).toHaveLength(1);
    expect(report.body.holdings[0]).toMatchObject({ instrumentId: 'AAPL', costILS: '10000.00' });
    expect(report.body).not.toHaveProperty('annualReturnPct');
    const bob = await request(app).get('/api/performance?uid=alice').auth('bob', { type: 'bearer' });
    expect(bob.status).toBe(200);
    expect(bob.body.holdings).toEqual([]);
    expect(bob.body.totalProfitILS).toBe('0.00');
  });

  it('blocks partial market and performance reads while the world advances', async () => {
    const { app, dataset, world } = await setup();
    const started = await request(app).post('/api/admin/clock/advance').auth('administrator', { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ worldId: world.id, target: dataset.events.find(event => event.kind === 'MARKET_OPEN')!.at });
    expect(started.status).toBe(202);
    for (const path of ['/api/instruments/LUMI.TA/history', '/api/watchlist', '/api/performance', '/api/daily-quiz']) {
      const blocked = await request(app).get(path).auth('alice', { type: 'bearer' });
      expect(blocked.status).toBe(423);
      expect(blocked.body.error).toMatchObject({ code: 'WORLD_ADVANCING', retryable: true });
    }
  });

  it('returns explicit retryable 503 errors when optional services are not wired', async () => {
    const { app } = await setup(false);
    for (const [path, code] of [
      ['/api/me/profile', 'PROFILE_UNAVAILABLE'], ['/api/instruments/LUMI.TA/history', 'MARKET_UNAVAILABLE'],
      ['/api/watchlist', 'MARKET_UNAVAILABLE'], ['/api/daily-quiz', 'QUIZ_UNAVAILABLE'], ['/api/performance', 'REPORT_UNAVAILABLE'],
    ]) {
      const unavailable = await request(app).get(path!).auth('alice', { type: 'bearer' });
      expect(unavailable.status).toBe(503);
      expect(unavailable.body.error).toMatchObject({ code, retryable: true });
      expect(unavailable.body.error.requestId).toBeTruthy();
    }
  });
});
