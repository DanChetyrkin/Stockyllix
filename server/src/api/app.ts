import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { z, ZodError } from 'zod';
import { GameError } from '../domain/errors.js';
import type { GameService } from '../services/game-service.js';

interface AppOptions {
  game: GameService;
  verifyToken: (token: string) => Promise<{ uid: string }>;
  adminUids: Set<string>;
  corsOrigins: string[];
  rateLimitEnabled?: boolean;
  logger?: (entry: Record<string, unknown>) => void;
}

const orderInput = z.object({
  worldId: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  instrumentId: z.string().min(1).max(40),
  side: z.enum(['buy', 'sell']),
  amountILS: z.string().regex(/^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/),
}).strict();

const initializeInput = z.object({ displayName: z.string().trim().min(2).max(40) }).strict();
const advanceInput = z.object({ target: z.iso.datetime({ offset: true }) }).strict();
const resetInput = z.object({ confirmation: z.literal('RESET') }).strict();

function requestKey(request: Request) {
  return z.string().uuid().parse(request.get('Idempotency-Key'));
}

function integerQuery(value: unknown, fallback: number) {
  return value === undefined ? fallback : z.coerce.number().int().min(0).max(1_000_000).parse(value);
}

export function createApp(options: AppOptions) {
  const app = express();
  const log = options.logger ?? ((entry) => process.stdout.write(`${JSON.stringify(entry)}\n`));
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use((request, response, next) => {
    const requestId = randomUUID();
    response.locals.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    response.setHeader('Cache-Control', 'no-store');
    const started = Date.now();
    response.on('finish', () => log({
      event: 'http', requestId, method: request.method, path: request.path,
      status: response.statusCode, durationMs: Date.now() - started,
    }));
    next();
  });
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || options.corsOrigins.includes(origin)) return callback(null, true);
      callback(new GameError('ORIGIN_NOT_ALLOWED', 'This website is not allowed to use the API.', 403));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    exposedHeaders: ['X-Request-Id'],
  }));
  app.use(express.json({ limit: '12kb' }));
  app.get('/health', (_request, response) => response.json({ status: 'ok', version: '1.0.0' }));

  const router = express.Router();
  if (options.rateLimitEnabled !== false) {
    router.use(rateLimit({
      windowMs: 60_000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false,
      message: { error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a minute.', retryable: true } },
    }));
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
  const uid = (response: Response) => response.locals.uid as string;
  router.post('/me/initialize', async (request, response) => {
    const input = initializeInput.parse(request.body);
    response.json(await options.game.initialize(uid(response), input.displayName));
  });
  router.get('/world', async (_request, response) => {
    response.json({ world: await options.game.getWorld(), isAdmin: Boolean(response.locals.isAdmin) });
  });
  router.get('/portfolio', async (_request, response) => response.json(await options.game.getPortfolio(uid(response))));
  router.get('/market', async (_request, response) => response.json(await options.game.getMarket()));
  router.get('/orders', async (request, response) => {
    const before = request.query.beforeSequence === undefined ? undefined : integerQuery(request.query.beforeSequence, 0);
    response.json(await options.game.getOrders(uid(response), before));
  });
  router.get('/leaderboard', async (request, response) => {
    const week = request.query.weekId === undefined ? undefined : z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(request.query.weekId);
    response.json(await options.game.getLeaderboard(integerQuery(request.query.page, 0), week));
  });
  router.post('/orders', async (request, response) => {
    const input = orderInput.parse(request.body);
    const order = await options.game.submitOrder(uid(response), input, requestKey(request));
    response.status(201).json({ order });
  });
  router.post('/daily-review/view', async (_request, response) => response.json(await options.game.recordReview(uid(response))));

  router.use('/admin', (_request, response, next) => {
    if (!response.locals.isAdmin) throw new GameError('FORBIDDEN', 'An administrator is required.', 403);
    next();
  });
  router.post('/admin/clock/advance', async (request, response) => {
    const input = advanceInput.parse(request.body);
    response.status(202).json(await options.game.advance(input.target, requestKey(request)));
  });
  router.post('/admin/clock/jobs/:id/step', async (request, response) => {
    const id = z.string().regex(/^[a-zA-Z0-9_-]+$/).max(100).parse(request.params.id);
    const result = await options.game.step(id);
    log({ event: 'clock_step', requestId: response.locals.requestId, jobId: id });
    response.json(result);
  });
  router.post('/admin/reset', async (request, response) => {
    resetInput.parse(request.body);
    response.status(201).json(await options.game.reset(requestKey(request)));
  });
  app.use('/api', router);
  app.use((_request, _response) => { throw new GameError('NOT_FOUND', 'This endpoint does not exist.', 404); });

  const errors: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
    let failure: GameError;
    if (error instanceof GameError) failure = error;
    else if (error instanceof ZodError || (error instanceof SyntaxError && 'body' in error)) {
      failure = new GameError('INVALID_INPUT', 'Please check the fields and try again.', 400);
    } else if (error instanceof Error && 'type' in error && error.type === 'entity.too.large') {
      failure = new GameError('INVALID_INPUT', 'The request is too large.', 413);
    } else {
      failure = new GameError('SERVICE_UNAVAILABLE', 'The server could not finish the request. Retry with the same request id.', 503, true);
      log({ event: 'request_failed', requestId: response.locals.requestId, errorType: error instanceof Error ? error.name : 'unknown' });
    }
    response.status(failure.status).json({ error: {
      code: failure.code, message: failure.message, retryable: failure.retryable, requestId: response.locals.requestId,
    } });
  };
  app.use(errors);
  return app;
}
