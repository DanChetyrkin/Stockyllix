import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/api/app.js';
import { MemoryStore } from '../src/data/memory-store.js';
import type { World } from '../src/domain/model.js';
import { clockPath, clockTarget, type WorldClock } from '../src/domain/clock.js';
import { DailyQuizService, type QuizView } from '../src/services/daily-quiz.js';
import { GameService } from '../src/services/game-service.js';
import { WorldClockService } from '../src/services/world-clock.js';
import { createDataset } from '../src/world/index.js';

async function setup() {
  const store = new MemoryStore();
  const game = new GameService(store, createDataset('game-day-quiz-test'));
  await game.initialize('alice', 'Alice');
  let now = new Date('2026-11-04T10:00:00Z');
  const quiz = new DailyQuizService(store, { now: () => now });
  const world = await game.getWorld();
  const setWorldNow = async (at: string) =>
    store.transaction(async tx => {
      const current = (await tx.get<World>(`worlds/${world.id}`))!;
      tx.set(`worlds/${world.id}`, { ...current, now: at, revision: current.revision + 1 });
    });
  return {
    store,
    quiz,
    game,
    world,
    setWorldNow,
    setRealNow: (at: string) => {
      now = new Date(at);
    },
  };
}

function answerInput(day: QuizView, answerIndex = 0) {
  return { worldId: day.worldId, date: day.date, questionId: day.question.id, answerIndex };
}

async function clockQuizSetup() {
  const store = new MemoryStore();
  const dataset = createDataset('quiz-logical-clock-fixture');
  let milliseconds = Date.parse('2026-11-04T10:00:00Z');
  const now = () => new Date(milliseconds);
  const game = new GameService(store, dataset, { now });
  const world = await game.getWorld();
  const clock = new WorldClockService(store, game, dataset, { now });
  const quiz = new DailyQuizService(store, {
    now,
    gameTime: async (world, tx) => {
      const clockState = await tx.get<WorldClock>(clockPath(world.id));
      return clockState ? clockTarget(clockState, world, dataset.endsAt, milliseconds) : world.now;
    },
  });
  const settle = async () => {
    for (let attempt = 0; attempt < 1000; attempt += 1) {
      clock.invalidate();
      await clock.synchronize();
      if (!(await clock.getWorld()).clock.syncing) return;
    }
    throw new Error('quiz clock did not settle');
  };
  return {
    game,
    world,
    quiz,
    clock,
    settle,
    elapse: (elapsed: number) => {
      milliseconds += elapsed;
    },
  };
}

async function advanceTo(game: GameService, target: string) {
  const world = await game.getWorld();
  let state = await game.advance(target, randomUUID(), world.id);
  for (let attempt = 0; attempt < 1000 && state.status !== 'idle'; attempt += 1) {
    if (!state.job) throw new Error('clock job missing');
    state = await game.step(state.job.id);
  }
  expect(state.status).toBe('idle');
}

describe('game-day financial quiz', () => {
  it('changes at logical Israel midnight without a market event or world write, and rejects yesterday’s answer', async () => {
    const { game, world, quiz, clock, settle, elapse } = await clockQuizSetup();
    await clock.configure('admin', { worldId: world.id, action: 'set', target: '2026-10-24T20:59:59Z' }, randomUUID());
    await settle();
    const previous = await quiz.get('alice');
    expect(previous.date).toBe('2026-10-24');
    await quiz.answer('alice', answerInput(previous));
    await clock.configure('admin', { worldId: world.id, action: 'resume' }, randomUUID());
    const processed = await game.getWorld();
    elapse(2000);
    await settle();
    expect(await game.getWorld()).toEqual(processed);
    const sunday = await quiz.get('alice');
    expect(sunday.date).toBe('2026-10-25');
    expect(sunday.question.id).not.toBe(previous.question.id);
    expect(sunday.answer).toBeNull();
    await expect(quiz.answer('alice', answerInput(previous))).rejects.toMatchObject({ code: 'QUIZ_EXPIRED' });
    expect((await quiz.answer('alice', answerInput(sunday))).date).toBe('2026-10-25');
  });

  it('keeps a paused logical date despite real days passing and follows Israel winter-time midnight on resume', async () => {
    const { world, quiz, clock, settle, elapse } = await clockQuizSetup();
    await clock.configure('admin', { worldId: world.id, action: 'set', target: '2026-10-25T21:59:59Z' }, randomUUID());
    await settle();
    const sunday = await quiz.get('alice');
    expect(sunday.date).toBe('2026-10-25');
    const answered = await quiz.answer('alice', answerInput(sunday));
    elapse(2 * 86_400_000);
    await settle();
    expect(await quiz.get('alice')).toEqual(answered);
    await clock.configure('admin', { worldId: world.id, action: 'resume' }, randomUUID());
    elapse(2000);
    await settle();
    const monday = await quiz.get('alice');
    expect(monday.date).toBe('2026-10-26');
    expect(monday.answer).toBeNull();
  });

  it('shares the game-day question across players and reloads without exposing its answer', async () => {
    const { quiz, store } = await setup();
    const alice = await quiz.get('alice');
    expect(await quiz.get('bob')).toEqual(alice);
    expect(await new DailyQuizService(store).get('alice')).toEqual(alice);
    expect(alice.date).toBe('2026-10-05');
    expect(alice.answer).toBeNull();
    expect(alice.question).not.toHaveProperty('correctIndex');
    expect(alice.question).not.toHaveProperty('explanation');
    expect(alice).not.toHaveProperty('nextResetAt');
    expect(alice.question.options).toHaveLength(4);
  });

  it('evaluates on the server and keeps the first answer across retries', async () => {
    const { quiz, store } = await setup();
    const day = await quiz.get('alice');
    const before = store.operations.writes;
    const first = await quiz.answer('alice', answerInput(day));
    expect(first.answer?.correct).toBe(first.answer?.correctIndex === 0);
    expect(first.answer?.explanation.length).toBeGreaterThan(20);
    expect(await quiz.answer('alice', answerInput(day, 3))).toEqual(first);
    expect(await quiz.get('alice')).toEqual(first);
    expect((await quiz.get('bob')).answer).toBeNull();
    expect(store.operations.writes - before).toBe(1);
  });

  it('accepts only the first committed answer across parallel submissions', async () => {
    const { quiz, store } = await setup();
    const day = await quiz.get('alice');
    const before = store.operations.writes;
    const answers = await Promise.all(
      [0, 1, 2, 3].map(answerIndex => quiz.answer('alice', answerInput(day, answerIndex))),
    );
    for (const result of answers) expect(result).toEqual(answers[0]);
    expect(store.operations.writes - before).toBe(1);
  });

  it.each([-1, 4, 1.5, Number.NaN])('rejects an out-of-range answer %s', async answerIndex => {
    const { quiz, store } = await setup();
    const day = await quiz.get('alice');
    const before = store.operations.writes;
    await expect(quiz.answer('alice', answerInput(day, answerIndex))).rejects.toMatchObject({
      code: 'INVALID_QUIZ_ANSWER',
    });
    expect(store.operations.writes).toBe(before);
  });

  it('changes exactly when the game clock crosses Israel midnight and rejects the old day', async () => {
    const { quiz, game } = await setup();
    await advanceTo(game, '2026-10-05T20:59:59Z');
    const previous = await quiz.get('alice');
    await quiz.answer('alice', answerInput(previous));
    expect(previous.date).toBe('2026-10-05');
    await advanceTo(game, '2026-10-05T21:00:00Z');
    const next = await quiz.get('alice');
    expect(next.date).toBe('2026-10-06');
    expect(next.question.id).not.toBe(previous.question.id);
    expect(next.answer).toBeNull();
    await expect(quiz.answer('alice', answerInput(previous))).rejects.toMatchObject({
      code: 'QUIZ_EXPIRED',
      status: 409,
    });
  });

  it('keeps the question and answer during the same game day even if real days pass', async () => {
    const { quiz, game, setRealNow } = await setup();
    const previous = await quiz.get('alice');
    const answered = await quiz.answer('alice', answerInput(previous));
    await advanceTo(game, '2026-10-05T12:00:00Z');
    setRealNow('2030-01-01T00:00:00Z');
    const current = await quiz.get('alice');
    expect(current.question).toEqual(previous.question);
    expect(current.date).toBe(previous.date);
    expect(current.answer).toEqual(answered.answer);
    expect(current.revision).toBeGreaterThan(previous.revision);
  });

  it('uses the final game day after a multi-day jump and stores only the current answer', async () => {
    const { quiz, game, store, world } = await setup();
    await quiz.answer('alice', answerInput(await quiz.get('alice')));
    await advanceTo(game, '2026-10-08T21:00:00Z');
    const final = await quiz.get('alice');
    expect(final.date).toBe('2026-10-09');
    expect(final.answer).toBeNull();
    expect((await new DailyQuizService(store).get('bob')).question).toEqual(final.question);
    await quiz.answer('alice', answerInput(final, 2));
    const records = await store.list<{ date: string }>(`worlds/${world.id}/players/alice/quiz`);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: 'current', data: { date: '2026-10-09' } });
  });

  it('scopes answers to the new world and rejects a stale reset request without deleting old data', async () => {
    const { quiz, game, store, world } = await setup();
    const previous = await quiz.get('alice');
    await quiz.answer('alice', answerInput(previous));
    const oldPath = `worlds/${world.id}/players/alice/quiz/current`;
    const oldAnswer = await store.get(oldPath);
    await game.reset(randomUUID(), world.id);
    const current = await quiz.get('alice');
    expect(current.worldId).not.toBe(previous.worldId);
    expect(current.date).toBe('2026-10-05');
    expect(current.answer).toBeNull();
    await expect(quiz.answer('alice', answerInput(previous))).rejects.toMatchObject({ code: 'QUIZ_EXPIRED' });
    expect(await store.get(oldPath)).toEqual(oldAnswer);
  });

  it('reads the Israel game date correctly across the daylight-saving transition', async () => {
    const { quiz, setWorldNow } = await setup();
    await setWorldNow('2026-10-24T20:59:59Z');
    expect((await quiz.get('alice')).date).toBe('2026-10-24');
    await setWorldNow('2026-10-24T21:00:00Z');
    const sunday = await quiz.get('alice');
    expect(sunday.date).toBe('2026-10-25');
    await setWorldNow('2026-10-25T21:59:59Z');
    expect((await quiz.get('alice')).question).toEqual(sunday.question);
    await setWorldNow('2026-10-25T22:00:00Z');
    expect((await quiz.get('alice')).date).toBe('2026-10-26');
  });

  it('does not repeat adjacent game-day questions, including shuffled cycle boundaries', async () => {
    const { quiz, setWorldNow } = await setup();
    let previous = '';
    for (let day = 0; day < 25; day += 1) {
      await setWorldNow(new Date(Date.UTC(2026, 9, 5 + day, 12)).toISOString());
      const current = await quiz.get('alice');
      expect(current.question.id).not.toBe(previous);
      previous = current.question.id;
    }
  });

  it('pauses reads and answers during a clock job without changing financial data', async () => {
    const { quiz, game, store, world } = await setup();
    const question = await quiz.get('alice');
    const playerPath = `worlds/${world.id}/players/alice`;
    const before = await store.get(playerPath);
    await game.advance('2026-10-05T12:00:00Z', randomUUID(), world.id);
    await expect(quiz.get('alice')).rejects.toMatchObject({ code: 'WORLD_ADVANCING', status: 423 });
    await expect(quiz.answer('alice', answerInput(question))).rejects.toMatchObject({
      code: 'WORLD_ADVANCING',
      status: 423,
    });
    expect(await store.get(playerPath)).toEqual(before);
    expect(await store.get(`${playerPath}/quiz/current`)).toBeUndefined();
  });

  it('never changes portfolio money or competition statistics when a question is answered', async () => {
    const { quiz, store, world } = await setup();
    const path = `worlds/${world.id}/players/alice`;
    const before = await store.get(path);
    const worldBefore = await store.get(`worlds/${world.id}`);
    await quiz.answer('alice', answerInput(await quiz.get('alice')));
    expect(await store.get(path)).toEqual(before);
    expect(await store.get(`worlds/${world.id}`)).toEqual(worldBefore);
    expect(await store.list(`${path}/orders`)).toEqual([]);
  });

  it('protects quiz routes and rejects forged identity, result and stale world fields', async () => {
    const { quiz, store, game } = await setup();
    const app = createApp({
      quiz,
      game,
      adminUids: new Set(),
      corsOrigins: [],
      rateLimitEnabled: false,
      verifyToken: async token => {
        if (!['alice', 'bob'].includes(token)) throw new Error('invalid token');
        return { uid: token };
      },
      logger: () => {},
    });
    expect((await request(app).get('/api/daily-quiz')).status).toBe(401);
    const day = await request(app).get('/api/daily-quiz').auth('alice', { type: 'bearer' });
    expect(day.status).toBe(200);
    const input = answerInput(day.body);
    expect(
      (
        await request(app)
          .post('/api/daily-quiz/answer')
          .auth('alice', { type: 'bearer' })
          .send({ ...input, uid: 'bob', correct: true })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/daily-quiz/answer')
          .auth('alice', { type: 'bearer' })
          .send({ ...input, answerIndex: 4 })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post('/api/daily-quiz/answer')
          .auth('alice', { type: 'bearer' })
          .send({ ...input, worldId: 'old-world' })
      ).status,
    ).toBe(409);
    expect(
      (await request(app).post('/api/daily-quiz/answer').auth('alice', { type: 'bearer' }).send(input)).status,
    ).toBe(200);
    expect((await request(app).get('/api/daily-quiz').auth('bob', { type: 'bearer' })).body.answer).toBeNull();
    expect(await store.list(`worlds/${input.worldId}/players/alice/orders`)).toEqual([]);
  });
});
