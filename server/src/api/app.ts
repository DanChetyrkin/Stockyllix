import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z, ZodError } from 'zod';
import { GameError } from '../domain/errors.js';
import type { GameService } from '../services/game-service.js';
import type { ProfileService } from '../services/profile-service.js';
import type { MarketInsightsService } from '../services/market-insights.js';
import type { DailyQuizService } from '../services/daily-quiz.js';
import type { PerformanceService } from '../services/performance-service.js';
import type { BankIsraelService } from '../services/bank-israel.js';
import type { WorldClockService } from '../services/world-clock.js';
import type { TestSimulationService } from '../services/test-simulation-service.js';

export interface GameServices {
  game: GameService;
  insights?: MarketInsightsService;
  quiz?: DailyQuizService;
  performance?: PerformanceService;
  clock?: WorldClockService;
  simulations?: TestSimulationService;
}

interface AppOptions extends GameServices {
  profile?: ProfileService;
  testRealmServices?: (uid: string) => GameServices | Promise<GameServices>;
  bankIsrael?: BankIsraelService;
  verifyToken: (token: string) => Promise<{ uid: string }>;
  adminUids: Set<string>;
  corsOrigins: string[];
  rateLimitEnabled?: boolean;
  logger?: (entry: Record<string, unknown>) => void;
}

const orderInput = z
  .object({
    worldId: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9_-]+$/),
    instrumentId: z.string().min(1).max(40),
    side: z.enum(['buy', 'sell']),
    amountILS: z.string().regex(/^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/),
  })
  .strict();

const initializeInput = z.object({ displayName: z.string().trim().min(2).max(40) }).strict();
const profileInput = z
  .object({
    displayName: z.string().trim().min(2).max(40),
    photoDataUrl: z.string().max(44_000).nullable().optional(),
  })
  .strict();
const worldIdInput = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const instrumentIdInput = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-zA-Z0-9_.-]+$/);
const quizInput = z
  .object({
    worldId: worldIdInput,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    questionId: z.string().min(1).max(60),
    answerIndex: z.number().int().min(0).max(3),
  })
  .strict();
const clockInput = z
  .object({
    worldId: worldIdInput,
    action: z.enum(['pause', 'resume', 'set', 'next']),
    target: z.iso.datetime({ offset: true }).optional(),
    targetIsrael: z
      .object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/) })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    input =>
      input.action === 'set'
        ? Number(input.target !== undefined) + Number(input.targetIsrael !== undefined) === 1
        : input.target === undefined && input.targetIsrael === undefined,
    { message: 'Set needs exactly one target date.' },
  );
const resetInput = z
  .object({
    worldId: worldIdInput,
    confirmation: z.literal('RESET'),
    datasetId: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9_-]+$/)
      .optional(),
    simulation: z
      .object({ startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
      .strict()
      .optional(),
  })
  .strict()
  .refine(input => !(input.datasetId && input.simulation), {
    message: 'Choose historical data or a separate simulated test world.',
  });

function requestKey(request: Request) {
  return z.string().uuid().parse(request.get('Idempotency-Key'));
}

function integerQuery(value: unknown, fallback: number) {
  return value === undefined ? fallback : z.coerce.number().int().min(0).max(1_000_000).parse(value);
}

// optional services are absent in some tests and configurations.
function available<T>(service: T | undefined, code: string, message: string): T {
  if (!service) throw new GameError(code, message, 503, true);
  return service;
}

export function createApp(options: AppOptions) {
  const app = express();
  const log = options.logger ?? (entry => process.stdout.write(`${JSON.stringify(entry)}\n`));
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use((request, response, next) => {
    const requestId = randomUUID();
    response.locals.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    response.setHeader('Cache-Control', 'no-store');
    const started = Date.now();
    response.on('finish', () =>
      log({
        event: 'http',
        requestId,
        method: request.method,
        path: request.path,
        status: response.statusCode,
        durationMs: Date.now() - started,
        uid: response.locals.uid ?? null,
      }),
    );
    next();
  });
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || options.corsOrigins.includes(origin)) return callback(null, true);
        callback(new GameError('ORIGIN_NOT_ALLOWED', 'This website is not allowed to use the API.', 403));
      },
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Stockyllix-Test'],
      exposedHeaders: ['X-Request-Id'],
    }),
  );
  // a resized profile photo fits here without raising limits for trading routes.
  app.use('/api/me/profile', express.json({ limit: '64kb' }));
  app.use(express.json({ limit: '12kb' }));
  app.get('/health', (_request, response) =>
    response.json({
      status: 'ok',
      version: '1.5.5',
      release: 'minimal-v10',
      commit: /^[a-f0-9]{40}$/i.test(process.env.RENDER_GIT_COMMIT ?? '') ? process.env.RENDER_GIT_COMMIT : null,
    }),
  );

  const router = express.Router();
  if (options.rateLimitEnabled !== false) {
    router.use(
      rateLimit({
        windowMs: 60_000,
        limit: 180,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        skipSuccessfulRequests: true,
        message: {
          error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a minute.', retryable: true },
        },
      }),
    );
  }
  router.use(async (request, response, next) => {
    const authorization = request.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) throw new GameError('UNAUTHENTICATED', 'Please sign in.', 401);
    try {
      const identity = await options.verifyToken(authorization.slice(7));
      if (!identity.uid || identity.uid.includes('/')) throw new Error('invalid uid');
      response.locals.uid = identity.uid;
      response.locals.isAdmin = options.adminUids.has(identity.uid);
    } catch {
      throw new GameError('UNAUTHENTICATED', 'Your session expired. Please sign in again.', 401);
    }
    next();
  });
  if (options.rateLimitEnabled !== false) {
    const clockStep = (request: Request, response: Response) =>
      response.locals.isAdmin === true &&
      request.method === 'POST' &&
      /^\/admin\/clock\/jobs\/[a-zA-Z0-9_-]{1,100}\/step$/.test(request.path);
    // verified clock workers use their own bucket; other requests stay limited per player.
    router.use(
      rateLimit({
        windowMs: 60_000,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        limit: (request, response) => (clockStep(request, response) ? 3000 : 180),
        keyGenerator: (request, response) =>
          `${clockStep(request, response) ? 'clock' : 'user'}:${response.locals.uid}`,
        requestPropertyName: 'identityRateLimit',
        message: {
          error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a minute.', retryable: true },
        },
      }),
    );
  }
  const uid = (response: Response) => response.locals.uid as string;
  const selected = (response: Response): GameServices => response.locals.gameServices ?? options;
  router.use(async (request, response, next) => {
    const test = request.get('X-Stockyllix-Test');
    if (test && test !== 'true')
      throw new GameError('INVALID_INPUT', 'The test-world header must be true or absent.', 400);
    if (test) {
      if (!response.locals.isAdmin)
        throw new GameError('FORBIDDEN', 'An administrator is required to use an isolated test world.', 403);
      if (!options.testRealmServices)
        throw new GameError('TEST_WORLD_UNAVAILABLE', 'Isolated test worlds are not configured.', 503);
      response.locals.gameServices = await options.testRealmServices(uid(response));
    }
    response.locals.testRealm = Boolean(test);
    // profile and reference rate do not depend on game time.
    const independent = /^\/(?:me\/profile|reference\/fx)(?:\/|$)/.test(request.path);
    const worker = /^\/admin\/clock\/jobs\//.test(request.path);
    const receipt = request.method === 'GET' && /^\/admin\/clock\/requests\//.test(request.path);
    if (!independent && !worker && !receipt) await selected(response).clock?.synchronize();
    next();
  });
  router.post('/me/initialize', async (request, response) => {
    const input = initializeInput.parse(request.body);
    response.json(await selected(response).game.initialize(uid(response), input.displayName));
  });
  const profile = () =>
    available(options.profile, 'PROFILE_UNAVAILABLE', 'Profile settings are temporarily unavailable.');
  router.get('/me/profile', async (_request, response) => {
    response.json({ profile: await profile().get(uid(response)) });
  });
  router.post('/me/profile', async (request, response) => {
    const input = profileInput.parse(request.body);
    response.json({ profile: await profile().save(uid(response), input) });
  });
  router.get('/world', async (_request, response) => {
    const services = selected(response);
    response.json({
      world: services.clock ? await services.clock.getWorld() : await services.game.getWorld(),
      isAdmin: Boolean(response.locals.isAdmin),
      testRealm: Boolean(response.locals.testRealm),
    });
  });
  router.get('/portfolio', async (_request, response) =>
    response.json(await selected(response).game.getPortfolio(uid(response))),
  );
  router.get('/performance', async (_request, response) => {
    const performance = available(
      selected(response).performance,
      'REPORT_UNAVAILABLE',
      'Performance is temporarily unavailable.',
    );
    response.json(await performance.get(uid(response)));
  });
  router.get('/market', async (_request, response) => response.json(await selected(response).game.getMarket()));
  router.get('/reference/fx', async (_request, response) => {
    const bankIsrael = available(
      options.bankIsrael,
      'REFERENCE_FX_UNAVAILABLE',
      'The Bank of Israel reference rate is temporarily unavailable.',
    );
    response.json(await bankIsrael.get());
  });
  const insights = (response: Response) =>
    available(selected(response).insights, 'MARKET_UNAVAILABLE', 'Market details are temporarily unavailable.');
  router.get('/instruments/:id/history', async (request, response) => {
    response.json(await insights(response).history(instrumentIdInput.parse(request.params.id)));
  });
  const quiz = (response: Response) =>
    available(selected(response).quiz, 'QUIZ_UNAVAILABLE', 'The daily quiz is temporarily unavailable.');
  router.get('/daily-quiz', async (_request, response) => {
    response.json(await quiz(response).get(uid(response)));
  });
  router.post('/daily-quiz/answer', async (request, response) => {
    response.json(await quiz(response).answer(uid(response), quizInput.parse(request.body)));
  });
  router.get('/orders', async (request, response) => {
    const before =
      request.query.beforeSequence === undefined ? undefined : integerQuery(request.query.beforeSequence, 0);
    response.json(await selected(response).game.getOrders(uid(response), before));
  });
  router.get('/leaderboard', async (request, response) => {
    const week =
      request.query.weekId === undefined
        ? undefined
        : z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .parse(request.query.weekId);
    const page = integerQuery(request.query.page, 1);
    if (page < 1) throw new GameError('INVALID_PAGE', 'Page numbers start at one.', 400);
    response.json(await selected(response).game.getLeaderboard(page, week));
  });
  router.post('/orders', async (request, response) => {
    const input = orderInput.parse(request.body);
    const order = await selected(response).game.submitOrder(uid(response), input, requestKey(request));
    response.status(201).json({ order });
  });
  router.post('/daily-review/view', async (_request, response) =>
    response.json(await selected(response).game.recordReview(uid(response))),
  );

  router.use('/admin', (_request, response, next) => {
    if (!response.locals.isAdmin) throw new GameError('FORBIDDEN', 'An administrator is required.', 403);
    next();
  });
  const clock = (response: Response) =>
    available(selected(response).clock, 'CLOCK_UNAVAILABLE', 'Clock controls are not configured.');
  router.post('/admin/clock/configure', async (request, response) => {
    const input = clockInput.parse(request.body);
    response.json(await clock(response).configure(uid(response), input, requestKey(request)));
  });
  router.get('/admin/clock/audit', async (_request, response) => {
    response.json(await clock(response).audit());
  });
  router.get('/admin/clock/targets', async (_request, response) => {
    response.json(await clock(response).targets());
  });
  router.get('/admin/clock/requests/:key', async (request, response) => {
    const key = z.string().uuid().parse(request.params.key);
    const worldId = request.query.worldId === undefined ? undefined : worldIdInput.parse(request.query.worldId);
    response.json(await clock(response).requestStatus(key, worldId));
  });
  router.post('/admin/clock/jobs/:id/step', async (request, response) => {
    const id = z
      .string()
      .regex(/^[a-zA-Z0-9_-]+$/)
      .max(100)
      .parse(request.params.id);
    const result = await selected(response).game.step(id);
    log({ event: 'clock_step', requestId: response.locals.requestId, jobId: id });
    response.json(result);
  });
  router.post('/admin/reset', async (request, response) => {
    const input = resetInput.parse(request.body);
    const services = selected(response);
    if (input.simulation && (!response.locals.testRealm || !services.simulations))
      throw new GameError(
        'TEST_SIMULATION_ONLY',
        'Simulated prices are available only in your isolated administrator test world.',
        403,
      );
    const choices = services.game.listDatasets();
    if (
      !response.locals.testRealm &&
      (input.datasetId
        ? choices.find(dataset => dataset.id === input.datasetId)?.source !== 'historical'
        : !choices.some(dataset => dataset.source === 'historical'))
    ) {
      throw new GameError(
        'HISTORICAL_DATA_REQUIRED',
        'The shared game must use an available real historical dataset.',
        400,
      );
    }
    const world = input.simulation
      ? await services.simulations!.create(
          services.game,
          uid(response),
          requestKey(request),
          input.worldId,
          input.simulation.startDate,
        )
      : await services.game.reset(requestKey(request), input.worldId, input.datasetId);
    services.clock?.invalidate();
    response.status(201).json(world);
  });
  router.get('/admin/datasets', (_request, response) =>
    response.json({
      datasets: selected(response).game.listDatasets(),
      simulationAllowed: Boolean(response.locals.testRealm && selected(response).simulations),
    }),
  );
  app.use('/api', router);
  app.use((_request, _response) => {
    throw new GameError('NOT_FOUND', 'This endpoint does not exist.', 404);
  });

  const errors: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
    let failure: GameError;
    if (error instanceof GameError) failure = error;
    else if (error instanceof ZodError || (error instanceof SyntaxError && 'body' in error)) {
      failure = new GameError('INVALID_INPUT', 'Please check the fields and try again.', 400);
    } else if (error instanceof Error && 'type' in error && error.type === 'entity.too.large') {
      failure = new GameError('INVALID_INPUT', 'The request is too large.', 413);
    } else {
      failure = new GameError(
        'SERVICE_UNAVAILABLE',
        'The server could not finish the request. Retry with the same request id.',
        503,
        true,
      );
      const rawCode = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
      const errorCode =
        (typeof rawCode === 'number' || typeof rawCode === 'string') && /^[-a-zA-Z0-9_./]{1,80}$/.test(String(rawCode))
          ? rawCode
          : 'UNKNOWN';
      log({
        event: 'request_failed',
        requestId: response.locals.requestId,
        errorType: error instanceof Error ? error.name : 'unknown',
        errorCode,
      });
    }
    response.status(failure.status).json({
      error: {
        code: failure.code,
        message: failure.message,
        retryable: failure.retryable,
        requestId: response.locals.requestId,
      },
    });
  };
  app.use(errors);
  return app;
}
