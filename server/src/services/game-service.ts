import { createHash, randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import type { DocumentStore, Transaction } from '../data/store.js';
import { GameError } from '../domain/errors.js';
import type { ClockJob, Dataset, LeaderboardRow, Order, OrderInput, Portfolio, Valuation, World, WorldEvent } from '../domain/model.js';
import { rankPortfolios } from '../domain/scoring.js';
import { executeOrder, parseAmount, reserveOrder } from '../domain/trading.js';
import { decimal, formatDecimal, instrumentPriceILS, portfolioSummary, portfolioValue, sampleWeek, weeklyReturn } from '../domain/valuation.js';
import { getWeekId, isEligibleJoin, isMarketOpen, nextExecution } from '../world/index.js';
import { previousSessionClose, priceChangePct } from '../world/price-change.js';
import { DatasetRegistry, datasetRegistry } from '../world/registry.js';

const PAGE_SIZE = 25;
const RANKING_PAGE_BATCH = 100;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const worldPath = (worldId: string) => `worlds/${worldId}`;
const playerPath = (worldId: string, uid: string) => `${worldPath(worldId)}/players/${uid}`;
const requestId = (key: string) => hash(key);
interface Pointer { worldId: string }
interface RankingPage { rows: LeaderboardRow[] }
interface RankingMeta { total: number; weekId: string; generation: string; pageCount: number }
interface ReviewRecord {
  realDate: string;
  worldDate: string;
  firstSeenAt: string;
  returnedOnLaterRealDay: boolean;
  baselineValueILS: string;
  previousReviewDate: string | null;
  viewedValueILS: string;
}
interface VisitRecord { lastRealDate: string; firstRealDate: string; distinctRealDays: number; lastValueILS: string }

export class GameService {
  private readonly now: () => Date;
  private readonly leaseMs: number;
  private readonly batchSize: number;
  private readonly datasets: DatasetRegistry;

  constructor(private readonly store: DocumentStore, dataset: Dataset | DatasetRegistry, options: { now?: () => Date; leaseMs?: number; batchSize?: number } = {}) {
    this.datasets = datasetRegistry(dataset);
    this.now = options.now ?? (() => new Date());
    this.leaseMs = options.leaseMs ?? 60_000;
    this.batchSize = options.batchSize ?? 25;
  }

  private freshWorld(id: string, datasetId = this.datasets.defaultId): World {
    const dataset = this.datasets.get(datasetId);
    return { id, now: dataset.startsAt, revision: 0, status: 'idle', snapshot: dataset.initialSnapshot, datasetId: dataset.id, job: null, leaderboardGeneration: null, weekId: getWeekId(dataset.startsAt) };
  }

  private async current(): Promise<World> {
    return this.store.transaction(async (tx) => {
      const pointer = await tx.get<Pointer>('system/current');
      if (pointer) {
        const world = await tx.get<World>(worldPath(pointer.worldId));
        if (!world) throw new GameError('WORLD_NOT_FOUND', 'The world is not available.', 503, true);
        this.datasets.get(world.datasetId);
        return world;
      }
      const world = this.freshWorld(`world-${randomUUID()}`);
      tx.set(worldPath(world.id), world);
      tx.set('system/current', { worldId: world.id });
      return world;
    });
  }

  private publicWorld(world: World) {
    const dataset = this.datasets.get(world.datasetId);
    const nextEvent = dataset.events.find((event) => Date.parse(event.at) > Date.parse(world.now));
    const job = world.job && {
      id: world.job.id, target: world.job.target, completedEvents: world.job.completedEvents,
      totalEvents: world.job.totalEvents, processedPortfolios: world.job.processedPortfolios,
      stage: world.job.stage, lastError: world.job.lastError,
      leaseExpiresAt: world.job.leaseOwner ? new Date(world.job.leaseUntil).toISOString() : null,
    };
    return {
      id: world.id, now: world.now, revision: world.revision, status: world.status, datasetId: world.datasetId,
      weekId: world.weekId, job, startsAt: dataset.startsAt, endsAt: dataset.endsAt,
      source: dataset.source, sourceDescription: dataset.sourceDescription,
      finished: Date.parse(world.now) >= Date.parse(dataset.endsAt),
      nextEvent: nextEvent ? { at: nextEvent.at, kind: nextEvent.kind, ...(nextEvent.market ? { market: nextEvent.market } : {}) } : null,
    };
  }

  private requireIdle(world: World) {
    if (world.status !== 'idle') throw new GameError('WORLD_ADVANCING', 'The shared world is advancing. Your last visible data is kept until it finishes.', 423, true);
  }

  private async checkRead(world: World) {
    const latest = await this.current();
    this.requireIdle(latest);
    if (latest.id !== world.id || latest.revision !== world.revision) throw new GameError('WORLD_CHANGED', 'The shared world changed. Refresh and try again.', 409, true);
  }

  private async txWorld(tx: Transaction, expectedId?: string): Promise<World> {
    const pointer = await tx.get<Pointer>('system/current');
    if (!pointer || (expectedId && pointer.worldId !== expectedId)) throw new GameError('WORLD_CHANGED', 'The world was reset. Refresh and try again.', 409, true);
    const world = await tx.get<World>(worldPath(pointer.worldId));
    if (!world) throw new GameError('WORLD_NOT_FOUND', 'The world is not available.', 503, true);
    this.datasets.get(world.datasetId);
    return world;
  }

  async getWorld() { return this.publicWorld(await this.current()); }
  listDatasets() { return this.datasets.summaries(); }

  async initialize(uid: string, displayName: string) {
    const initial = await this.current();
    return this.store.transaction(async (tx) => {
      const world = await this.txWorld(tx, initial.id);
      const existing = await tx.get<Portfolio>(playerPath(world.id, uid));
      this.requireIdle(world);
      if (existing) return existing;
      const portfolio: Portfolio = {
        uid, displayName: displayName.trim().slice(0, 40) || 'Player', cashAgorot: 100_000_000, reservedCashAgorot: 0,
        holdings: {}, pendingOrderIds: [], pendingBuyAgorot: {}, nextSequence: 1,
        week: { weekId: world.weekId, startValueILS: '1000000.000000000000', peakValueILS: '1000000.000000000000', mddRatio: '0', eligible: isEligibleJoin(world.now) },
        lastEventId: null, joinedAt: world.now, createdAt: this.now().toISOString(),
      };
      tx.set(playerPath(world.id, uid), portfolio);
      return portfolio;
    });
  }

  async getPortfolio(uid: string) {
    const world = await this.current();
    const dataset = this.datasets.get(world.datasetId);
    this.requireIdle(world);
    const portfolio = await this.store.get<Portfolio>(playerPath(world.id, uid));
    if (!portfolio) throw new GameError('PLAYER_NOT_INITIALIZED', 'Create your player profile first.', 404);
    const realDate = this.realDate();
    const review = await this.store.get<ReviewRecord>(`${playerPath(world.id, uid)}/reviews/${realDate}`);
    const activity = review ? undefined : await this.store.get<VisitRecord>(`${playerPath(world.id, uid)}/activity/current`);
    const summary = portfolioSummary(dataset, world.snapshot, portfolio);
    const baseline = review?.baselineValueILS ?? activity?.lastValueILS ?? '1000000';
    const valueChangeILS = formatDecimal(portfolioValue(dataset, world.snapshot, portfolio).sub(baseline), 2);
    const largest = [...summary.holdings].sort((a, b) => decimal(b.valueILS).cmp(a.valueILS))[0];
    await this.checkRead(world);
    return {
      worldId: world.id, revision: world.revision, portfolio, summary,
      dailyReview: {
        worldDate: DateTime.fromISO(world.now).setZone('Asia/Jerusalem').toISODate(), realDate, seenToday: Boolean(review),
        returnedOnLaterRealDay: review?.returnedOnLaterRealDay ?? false,
        valueChangeILS, previousReviewDate: review?.previousReviewDate ?? activity?.lastRealDate ?? null,
        pendingOrders: portfolio.pendingOrderIds.length,
        headline: `Your weekly return is ${formatDecimal(summary.weeklyReturnPct, 2)}%`,
        insight: largest ? `${largest.instrumentId} is your largest holding (${largest.weightPct}%). Diversification limits exposure to one instrument.` : 'Cash has no price drawdown. Compare return and stability together before deciding how to invest.',
        largestHolding: largest ?? null,
      },
    };
  }

  async getMarket() {
    const world = await this.current();
    const dataset = this.datasets.get(world.datasetId);
    this.requireIdle(world);
    const previousCloses = {
      TA: previousSessionClose(dataset, 'TA', world.now),
      US: previousSessionClose(dataset, 'US', world.now),
    };
    const instruments = dataset.instruments.map((instrument) => {
      const next = nextExecution(dataset, instrument.id, world.now);
      return {
        ...instrument, price: world.snapshot.prices[instrument.id]!, priceILS: instrumentPriceILS(dataset, world.snapshot, instrument.id).toFixed(8),
        dailyChangePct: priceChangePct(world.snapshot.prices[instrument.id]!, previousCloses[instrument.market]?.snapshot.prices[instrument.id]),
        marketOpen: isMarketOpen(dataset, instrument.market, world.now), nextExecutionAt: next?.at ?? null,
        nextExecutionKind: next?.kind ?? null,
      };
    });
    await this.checkRead(world);
    return { worldId: world.id, revision: world.revision, instruments, fx: world.snapshot.fx, fxAsOf: world.snapshot.fxAsOf, asOf: world.snapshot.at };
  }

  async getOrders(uid: string, beforeSequence?: number) {
    const world = await this.current();
    const dataset = this.datasets.get(world.datasetId);
    this.requireIdle(world);
    const rows = await this.store.list<Order>(`${playerPath(world.id, uid)}/orders`, {
      orderBy: 'sequence', direction: 'desc', limit: PAGE_SIZE + 1,
      ...(beforeSequence === undefined ? {} : { where: [['sequence', '<', beforeSequence]] }),
    });
    await this.checkRead(world);
    const orders = rows.slice(0, PAGE_SIZE).map((row) => ({
      ...row.data,
      currency: dataset.instruments.find((instrument) => instrument.id === row.data.instrumentId)!.currency,
    }));
    return { worldId: world.id, revision: world.revision, orders, hasMore: rows.length > PAGE_SIZE, nextBeforeSequence: orders.at(-1)?.sequence ?? null };
  }

  async getLeaderboard(page = 1, weekId?: string) {
    const world = await this.current();
    this.requireIdle(world);
    const requestedWeek = weekId ?? world.weekId;
    const archive = await this.store.get<{ generation: string }>(`${worldPath(world.id)}/weeks/${requestedWeek}`);
    const generation = requestedWeek === world.weekId ? (world.leaderboardGeneration ?? archive?.generation) : archive?.generation;
    if (!generation) {
      await this.checkRead(world);
      return { worldId: world.id, revision: world.revision, rows: [], total: 0, page, pageSize: PAGE_SIZE, weekId: requestedWeek, generation: null };
    }
    const base = `${worldPath(world.id)}/leaderboards/${generation}`;
    const meta = await this.store.get<RankingMeta>(base);
    const result = await this.store.get<RankingPage>(`${base}/pages/${page}`);
    await this.checkRead(world);
    return { worldId: world.id, revision: world.revision, rows: result?.rows ?? [], total: meta?.total ?? 0, page, pageSize: PAGE_SIZE, weekId: requestedWeek, generation };
  }

  async submitOrder(uid: string, input: OrderInput, key: string): Promise<Order> {
    this.validateKey(key);
    if (input.side !== 'buy' && input.side !== 'sell') throw new GameError('INVALID_SIDE', 'Order side must be buy or sell.', 400);
    const amountAgorot = parseAmount(input.amountILS);
    await this.current();
    return this.store.transaction(async (tx) => {
      const world = await this.txWorld(tx, input.worldId);
      const dataset = this.datasets.get(world.datasetId);
      const path = playerPath(world.id, uid);
      const portfolio = await tx.get<Portfolio>(path);
      const id = requestId(key);
      const existing = await tx.get<Order>(`${path}/orders/${id}`);
      if (existing) {
        if (existing.instrumentId !== input.instrumentId || existing.side !== input.side || existing.amountAgorot !== amountAgorot) throw new GameError('IDEMPOTENCY_CONFLICT', 'This request key was already used with different order details.', 409);
        return existing;
      }
      this.requireIdle(world);
      if (!portfolio) throw new GameError('PLAYER_NOT_INITIALIZED', 'Create your player profile first.', 404);
      if (!dataset.instruments.some((instrument) => instrument.id === input.instrumentId)) throw new GameError('UNKNOWN_INSTRUMENT', 'Unknown instrument.', 400);
      const event = nextExecution(dataset, input.instrumentId, world.now);
      if (!event || Date.parse(event.at) > Date.parse(dataset.endsAt)) throw new GameError('DATASET_FINISHED', 'No execution event remains for this instrument.');
      const order: Order = {
        id, uid, worldId: world.id, instrumentId: input.instrumentId, side: input.side, amountAgorot,
        sequence: portfolio.nextSequence, status: 'pending', submittedAt: world.now, createdAt: this.now().toISOString(),
        executeEventId: event.id, executeAt: event.at, requestKey: key,
      };
      const next = reserveOrder(dataset, portfolio, order, input, world.snapshot);
      tx.set(path, next);
      tx.set(`${path}/orders/${id}`, order);
      return order;
    });
  }

  async advance(target: string, key: string, expectedWorldId?: string) {
    this.validateKey(key);
    const timestamp = Date.parse(target);
    if (!Number.isFinite(timestamp)) throw new GameError('INVALID_TIME', 'Target must be a valid ISO date.', 400);
    const initial = await this.current();
    await this.store.transaction(async (tx) => {
      const world = await this.txWorld(tx, expectedWorldId ?? initial.id);
      const dataset = this.datasets.get(world.datasetId);
      const requestPath = `${worldPath(world.id)}/advanceRequests/${requestId(key)}`;
      const existing = await tx.get<{ target: string; jobId: string }>(requestPath);
      if (existing) {
        if (Date.parse(existing.target) !== timestamp) throw new GameError('IDEMPOTENCY_CONFLICT', 'This request key was already used for another target.', 409);
        return;
      }
      this.requireIdle(world);
      if (timestamp <= Date.parse(world.now) || timestamp > Date.parse(dataset.endsAt)) throw new GameError('INVALID_TIME', 'Target must be after the world clock and within the dataset.', 400);
      const eventIndex = dataset.events.findIndex((event) => Date.parse(event.at) > Date.parse(world.now));
      const totalEvents = dataset.events.filter((event) => Date.parse(event.at) > Date.parse(world.now) && Date.parse(event.at) <= timestamp).length;
      const job: ClockJob = {
        id: randomUUID(), target: new Date(timestamp).toISOString(), requestKey: key, fence: 0, leaseOwner: null, leaseUntil: 0,
        eventIndex: eventIndex === -1 ? dataset.events.length : eventIndex, afterUid: null,
        stage: totalEvents ? 'events' : 'leaderboard', completedEvents: 0, totalEvents, processedPortfolios: 0, lastError: null, createdAt: this.now().toISOString(),
      };
      tx.set(worldPath(world.id), { ...world, status: 'advancing', job });
      tx.set(requestPath, { target: job.target, jobId: job.id });
    });
    return this.jobResponse(await this.current());
  }

  private jobResponse(world: World) { return { worldId: world.id, revision: world.revision, status: world.status, job: this.publicWorld(world).job }; }

  private requireLease(world: World, jobId: string, owner: string, fence: number) {
    if (world.status !== 'advancing' || !world.job || world.job.id !== jobId || world.job.leaseOwner !== owner || world.job.fence !== fence || world.job.leaseUntil <= this.now().getTime()) throw new GameError('LEASE_LOST', 'This worker lost its clock lease. Retry to resume safely.', 409, true);
    return world.job;
  }

  async step(jobId: string) {
    const initial = await this.current();
    const owner = randomUUID();
    const claimed = await this.store.transaction(async (tx) => {
      const world = await this.txWorld(tx, initial.id);
      if (world.status === 'idle') return world;
      if (!world.job || world.job.id !== jobId) throw new GameError('JOB_NOT_FOUND', 'The clock job does not exist.', 404);
      if (world.job.leaseOwner && world.job.leaseUntil > this.now().getTime()) throw new GameError('JOB_BUSY', 'Another worker is processing this clock job. Retry shortly.', 409, true);
      const job = { ...world.job, fence: world.job.fence + 1, leaseOwner: owner, leaseUntil: this.now().getTime() + this.leaseMs, lastError: null };
      tx.set(worldPath(world.id), { ...world, job });
      return { ...world, job };
    });
    if (!claimed.job || claimed.status === 'idle') return this.jobResponse(claimed);
    const fence = claimed.job.fence;
    try {
      if (claimed.job.stage === 'events') await this.processEventBatch(claimed, owner, fence);
      else await this.processRankingBatch(claimed, owner, fence);
    } catch (error) {
      await this.store.transaction(async (tx) => {
        const world = await this.txWorld(tx, claimed.id);
        if (world.job?.id === jobId && world.job.leaseOwner === owner && world.job.fence === fence) {
          tx.set(worldPath(world.id), { ...world, job: { ...world.job, leaseOwner: null, leaseUntil: 0, lastError: error instanceof GameError ? error.code : 'PROCESSING_FAILED' } });
        }
      }).catch(() => undefined);
      throw error;
    }
    return this.jobResponse(await this.current());
  }

  private async processEventBatch(claimed: World, owner: string, fence: number) {
    const dataset = this.datasets.get(claimed.datasetId);
    const job = claimed.job!;
    const event = dataset.events[job.eventIndex];
    if (!event || Date.parse(event.at) > Date.parse(job.target)) throw new Error('invalid clock event cursor');
    const players = await this.store.list<Portfolio>(`${worldPath(claimed.id)}/players`, { orderBy: 'uid', limit: this.batchSize, ...(job.afterUid ? { startAfter: job.afterUid } : {}) });
    const started = Date.now();
    let processed = 0;
    for (const player of players) {
      if (processed && Date.now() - started >= 8000) break;
      await this.processPlayerEvent(claimed.id, player.id, event, job.id, owner, fence);
      processed += 1;
    }
    await this.store.transaction(async (tx) => {
      const world = await this.txWorld(tx, claimed.id);
      const current = this.requireLease(world, job.id, owner, fence);
      if (players.length === this.batchSize || processed < players.length) {
        tx.set(worldPath(world.id), { ...world, job: { ...current, afterUid: players[processed - 1]!.data.uid, processedPortfolios: current.processedPortfolios + processed, leaseOwner: null, leaseUntil: 0 } });
      } else {
        const completedEvents = current.completedEvents + 1;
        const stage = event.kind === 'WEEK_END' || completedEvents === current.totalEvents ? 'leaderboard' : 'events';
        tx.set(worldPath(world.id), {
          ...world, now: event.at, snapshot: event.snapshot, weekId: event.kind === 'WEEK_START' ? event.weekId : world.weekId,
          job: { ...current, eventIndex: current.eventIndex + 1, completedEvents, afterUid: null, stage, processedPortfolios: current.processedPortfolios + processed, leaseOwner: null, leaseUntil: 0 },
        });
      }
    });
  }

  private async processPlayerEvent(worldId: string, uid: string, event: WorldEvent, jobId: string, owner: string, fence: number) {
    await this.store.transaction(async (tx) => {
      const world = await this.txWorld(tx, worldId);
      const dataset = this.datasets.get(world.datasetId);
      this.requireLease(world, jobId, owner, fence);
      const path = playerPath(worldId, uid);
      let portfolio = await tx.get<Portfolio>(path);
      if (!portfolio || portfolio.lastEventId === event.id) return;
      const pending = await Promise.all(portfolio.pendingOrderIds.map((id) => tx.get<Order>(`${path}/orders/${id}`)));
      if (pending.some((order) => !order)) throw new GameError('DATA_INTEGRITY', 'A reserved order is missing. The clock is paused for investigation.', 503);
      const changed: Order[] = [];
      if (event.kind === 'WEEK_START') {
        const value = portfolioValue(dataset, event.snapshot, portfolio).toFixed(12);
        portfolio = { ...portfolio, week: { weekId: event.weekId, startValueILS: value, peakValueILS: value, mddRatio: '0', eligible: true } };
      }
      const due = pending.filter((order): order is Order => Boolean(order && order.status === 'pending' && order.executeEventId === event.id)).sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));
      for (const order of due) {
        const result = executeOrder(dataset, portfolio, order, event);
        portfolio = result.portfolio;
        changed.push(result.order);
      }
      const value = portfolioValue(dataset, event.snapshot, portfolio);
      portfolio = { ...portfolio, lastEventId: event.id, week: sampleWeek(portfolio.week, value) };
      if (event.kind === 'WEEK_END') portfolio.week = { ...portfolio.week, finalValueILS: value.toFixed(12) };
      const valuation: Valuation = { uid, eventId: event.id, at: event.at, valueILS: value.toFixed(12), weekId: portfolio.week.weekId, weeklyReturnPct: formatDecimal(weeklyReturn(value, portfolio.week), 12), mddPct: formatDecimal(decimal(portfolio.week.mddRatio).mul(100), 12) };
      tx.set(path, portfolio);
      changed.forEach((order) => tx.set(`${path}/orders/${order.id}`, order));
      tx.set(`${path}/valuations/${hash(event.id)}`, valuation);
    });
  }

  private async allPlayers(worldId: string): Promise<Portfolio[]> {
    const players: Portfolio[] = [];
    let afterUid: string | undefined;
    while (true) {
      const batch = await this.store.list<Portfolio>(`${worldPath(worldId)}/players`, { orderBy: 'uid', limit: 250, ...(afterUid ? { startAfter: afterUid } : {}) });
      players.push(...batch.map((row) => row.data));
      if (batch.length < 250) return players;
      afterUid = batch.at(-1)!.data.uid;
    }
  }

  private async processRankingBatch(claimed: World, owner: string, fence: number) {
    const dataset = this.datasets.get(claimed.datasetId);
    const job = claimed.job!;
    const rows = rankPortfolios(dataset, claimed.snapshot, await this.allPlayers(claimed.id));
    const generation = `${job.id}-${job.eventIndex}`;
    const pageCount = Math.ceil(rows.length / PAGE_SIZE);
    const nextPage = job.afterUid ? Number(job.afterUid.slice(5)) : 1;
    const lastPage = Math.min(pageCount, nextPage + RANKING_PAGE_BATCH - 1);
    const isWeeklyEnd = dataset.events[job.eventIndex - 1]?.kind === 'WEEK_END';
    await this.store.transaction(async (tx) => {
      const world = await this.txWorld(tx, claimed.id);
      const current = this.requireLease(world, job.id, owner, fence);
      const archivePath = `${worldPath(world.id)}/weeks/${world.weekId}`;
      const existingArchive = await tx.get<{ generation: string; finalized: boolean }>(archivePath);
      const base = `${worldPath(world.id)}/leaderboards/${generation}`;
      for (let page = nextPage; page <= lastPage; page += 1) tx.set(`${base}/pages/${page}`, { rows: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) });
      if (lastPage < pageCount) {
        tx.set(worldPath(world.id), { ...world, job: { ...current, afterUid: `page:${lastPage + 1}`, leaseOwner: null, leaseUntil: 0 } });
        return;
      }
      tx.set(base, { total: rows.length, weekId: world.weekId, generation, pageCount } satisfies RankingMeta);
      if (!existingArchive?.finalized) tx.set(archivePath, { generation, finalized: isWeeklyEnd });
      if (current.completedEvents < current.totalEvents) {
        tx.set(worldPath(world.id), { ...world, leaderboardGeneration: generation, job: { ...current, stage: 'events', afterUid: null, leaseOwner: null, leaseUntil: 0 } });
      } else {
        tx.set(worldPath(world.id), { ...world, now: current.target, revision: world.revision + 1, status: 'idle', job: null, leaderboardGeneration: existingArchive?.finalized ? existingArchive.generation : generation });
      }
    });
  }

  async reset(key: string, expectedWorldId?: string, datasetId?: string) {
    this.validateKey(key);
    if (datasetId && !this.datasets.summaries().some(item => item.id === datasetId)) throw new GameError('UNKNOWN_DATASET', 'Choose an available demonstration dataset.', 400);
    const request = { worldId: expectedWorldId ?? null, datasetId: datasetId ?? null };
    const world = await this.store.transaction(async (tx) => {
      const path = `adminRequests/${requestId(key)}`;
      const existing = await tx.get<{ worldId: string; request?: typeof request }>(path);
      const existingWorld = existing ? await tx.get<World>(worldPath(existing.worldId)) : undefined;
      if (existingWorld) {
        if (existing?.request ? existing.request.worldId !== request.worldId || existing.request.datasetId !== request.datasetId : Boolean(datasetId && datasetId !== existingWorld.datasetId)) {
          throw new GameError('IDEMPOTENCY_CONFLICT', 'This reset request key was already used for another world or dataset.', 409);
        }
        return existingWorld;
      }
      const pointer = await tx.get<Pointer>('system/current');
      if (expectedWorldId && pointer?.worldId !== expectedWorldId) throw new GameError('WORLD_CHANGED', 'The world was reset. Refresh and try again.', 409, true);
      const active = pointer ? await tx.get<World>(worldPath(pointer.worldId)) : undefined;
      if (active) this.requireIdle(active);
      const created = this.freshWorld(`world-${randomUUID()}`, datasetId ?? active?.datasetId ?? this.datasets.defaultId);
      tx.set(worldPath(created.id), created);
      tx.set('system/current', { worldId: created.id });
      tx.set(path, { worldId: created.id, request });
      return created;
    });
    return this.publicWorld(world);
  }

  private realDate() { return DateTime.fromJSDate(this.now()).setZone('Asia/Jerusalem').toISODate()!; }

  async recordReview(uid: string) {
    const initial = await this.current();
    const realDate = this.realDate();
    return this.store.transaction(async (tx) => {
      const world = await this.txWorld(tx, initial.id);
      const dataset = this.datasets.get(world.datasetId);
      const path = playerPath(world.id, uid);
      const portfolio = await tx.get<Portfolio>(path);
      const existing = await tx.get<ReviewRecord>(`${path}/reviews/${realDate}`);
      const visit = await tx.get<VisitRecord>(`${path}/activity/current`);
      this.requireIdle(world);
      if (!portfolio) throw new GameError('PLAYER_NOT_INITIALIZED', 'Create your player profile first.', 404);
      if (existing) return existing;
      const review: ReviewRecord = {
        realDate, worldDate: DateTime.fromISO(world.now).setZone('Asia/Jerusalem').toISODate()!,
        firstSeenAt: this.now().toISOString(), returnedOnLaterRealDay: Boolean(visit && visit.firstRealDate < realDate),
        baselineValueILS: visit?.lastValueILS ?? '1000000.000000000000', previousReviewDate: visit?.lastRealDate ?? null,
        viewedValueILS: portfolioValue(dataset, world.snapshot, portfolio).toFixed(12),
      };
      tx.set(`${path}/reviews/${realDate}`, review);
      tx.set(`${path}/activity/current`, { lastRealDate: realDate, firstRealDate: visit?.firstRealDate ?? realDate, distinctRealDays: (visit?.distinctRealDays ?? 0) + 1, lastValueILS: review.viewedValueILS });
      return review;
    });
  }

  private validateKey(key: string) {
    if (typeof key !== 'string' || key.length < 8 || key.length > 128) throw new GameError('INVALID_REQUEST_KEY', 'A request key between 8 and 128 characters is required.', 400);
  }
}
