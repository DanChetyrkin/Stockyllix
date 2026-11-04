import { createHash } from 'node:crypto';
import { DateTime } from 'luxon';
import type { DocumentStore } from '../data/store.js';
import type { Dataset, Order, Portfolio, World } from '../domain/model.js';
import { clockPath, clockTarget, type WorldClock } from '../domain/clock.js';
import { GameError } from '../domain/errors.js';
import { dueEvents, nextMarketEvent } from '../world/index.js';
import { datasetRegistry, type DatasetRegistry } from '../world/registry.js';
import type { GameService } from './game-service.js';

type ClockAction = 'pause' | 'resume' | 'set' | 'next' | 'next_order';
interface ClockInput { worldId: string; action: ClockAction; target?: string; targetIsrael?: { date: string; time: string } }
interface ClockRequest { input: ClockInput; actor: string; target?: string; requestedAt?: string; clockVersion?: number }
interface Context { world: World; clock: WorldClock; dataset: Dataset }

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

function israelTarget(input: { date: string; time: string }) {
  const local = `${input.date}T${input.time}`;
  const parsed = DateTime.fromISO(local, { zone: 'Asia/Jerusalem' });
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) || !parsed.isValid || parsed.toFormat("yyyy-MM-dd'T'HH:mm") !== local) {
    throw new GameError('INVALID_ISRAEL_TIME', 'This date and time do not exist in Israel. Choose another local time.', 400);
  }
  if (parsed.getPossibleOffsets().length > 1) throw new GameError('AMBIGUOUS_ISRAEL_TIME', 'This hour occurs twice when Israel leaves daylight saving time. Choose a time outside the repeated hour.', 400);
  return parsed.toUTC().toISO()!;
}

export class WorldClockService {
  private readonly datasets: DatasetRegistry;
  private readonly now: () => Date;
  private pending: Promise<void> | null = null;
  private checkedAt = 0;

  constructor(private readonly store: DocumentStore, private readonly game: GameService, dataset: Dataset | DatasetRegistry,
    private readonly options: { now?: () => Date; maxSteps?: number; budgetMs?: number; autostart?: boolean; logger?: (entry: Record<string, unknown>) => void } = {}) {
    this.datasets = datasetRegistry(dataset);
    this.now = options.now ?? (() => new Date());
  }

  private async context(): Promise<Context> {
    if (!await this.store.get('system/current')) await this.game.getWorld();
    return this.store.transaction(async tx => {
      const pointer = await tx.get<{ worldId: string }>('system/current');
      const world = pointer && await tx.get<World>(`worlds/${pointer.worldId}`);
      if (!world) throw new GameError('WORLD_NOT_FOUND', 'The world is not available.', 503, true);
      const dataset = this.datasets.get(world.datasetId);
      let clock = await tx.get<WorldClock>(clockPath(world.id));
      if (!clock) {
        const serverNow = this.now().toISOString();
        clock = { running: this.options.autostart !== false,
          anchorGameAt: world.job?.target ?? world.now, anchorServerAt: serverNow,
          version: 1, updatedAt: serverNow, updatedBy: 'server' };
        tx.set(clockPath(world.id), clock);
      }
      return { world, dataset, clock };
    });
  }

  private view({ world, dataset, clock }: Context) {
    const serverNow = this.now().toISOString();
    const targetNow = clockTarget(clock, world, dataset.endsAt, Date.parse(serverNow));
    const finished = Date.parse(world.now) >= Date.parse(dataset.endsAt);
    return { running: clock.running && !finished, serverNow, targetNow,
      syncing: world.status === 'advancing' || dueEvents(dataset, world.now, targetNow).length > 0, finished,
      error: world.job?.lastError ?? null, version: clock.version };
  }

  async getWorld() {
    const context = await this.context();
    const world = await this.game.getWorld();
    if (world.id !== context.world.id) throw new GameError('WORLD_CHANGED', 'The world changed. Refresh the clock.', 409, true);
    return { ...world, clock: this.view({ ...context, world: { ...context.world, ...world, job: context.world.job } }) };
  }

  // requests resume durable work; nothing depends on a browser or an always-on timer.
  async synchronize() {
    if (this.pending) return this.pending;
    if (this.now().getTime() - this.checkedAt < 1000) return;
    this.pending = this.synchronizeBounded().finally(() => { this.pending = null; this.checkedAt = this.now().getTime(); });
    return this.pending;
  }

  private async synchronizeBounded() {
    const started = Date.now();
    for (let index = 0; index < (this.options.maxSteps ?? 2); index += 1) {
      const context = await this.context();
      const { world, dataset, clock } = context;
      if (world.job?.lastError && (world.job.retryAfter ?? 0) > this.now().getTime()) return;
      if (world.status === 'idle') {
        const target = clockTarget(clock, world, dataset.endsAt, this.now().getTime());
        const due = dueEvents(dataset, world.now, target);
        const advanceTo = due.at(-1)?.at ?? (Date.parse(target) >= Date.parse(dataset.endsAt) && Date.parse(world.now) < Date.parse(dataset.endsAt) ? dataset.endsAt : null);
        if (!advanceTo) return;
        try { await this.game.advance(advanceTo, `automatic-${hash(`${world.id}/${advanceTo}`)}`, world.id); }
        catch (cause) {
          if (!(cause instanceof GameError) || !['WORLD_ADVANCING', 'WORLD_CHANGED'].includes(cause.code)) throw cause;
        }
      }
      const latest = await this.game.getWorld();
      if (!latest.job) continue;
      try { await this.game.step(latest.job.id); }
      catch (cause) {
        if (cause instanceof GameError && ['JOB_BUSY', 'LEASE_LOST', 'WORLD_CHANGED'].includes(cause.code)) return;
        // the saved job keeps the error, so the admin screen can show it and resume later.
        const entry = { event: 'clock_sync_failed', worldId: latest.id, jobId: latest.job.id, code: cause instanceof GameError ? cause.code : 'PROCESSING_FAILED' };
        if (this.options.logger) this.options.logger(entry);
        else process.stdout.write(`${JSON.stringify(entry)}\n`);
        return;
      }
      if (Date.now() - started >= (this.options.budgetMs ?? 8000)) return;
    }
  }

  private async pendingOrders(world: World, dataset: Dataset) {
    let after: string | undefined;
    let scanned = 0;
    let pendingOrderCount = 0;
    let earliest: Order | null = null;
    let orderCount = 0;
    for (;;) {
      const players = await this.store.list<Portfolio>(`worlds/${world.id}/players`, { limit: 100, ...(after ? { startAfter: after } : {}) });
      if (!players.length) break;
      scanned += players.length;
      if (scanned > 5000) throw new GameError('CLOCK_TARGET_LIMIT', 'This administrator overview supports up to 5,000 players. Advance a selected market event instead.', 422);
      for (let offset = 0; offset < players.length; offset += 10) {
        const orders = await Promise.all(players.slice(offset, offset + 10).flatMap(player => player.data.pendingOrderIds.map(id => this.store.get<Order>(`worlds/${world.id}/players/${player.id}/orders/${id}`))));
        for (const order of orders) {
          if (!order || order.status !== 'pending') continue;
          pendingOrderCount += 1;
          if (!earliest || Date.parse(order.executeAt) < Date.parse(earliest.executeAt)) { earliest = order; orderCount = 1; }
          else if (order.executeEventId === earliest.executeEventId) orderCount += 1;
        }
      }
      after = players.at(-1)!.id;
      if (players.length < 100) break;
    }
    const event = earliest && dataset.events.find(event => event.id === earliest.executeEventId);
    if (earliest && (!event?.market || !['MARKET_OPEN', 'MARKET_CLOSE'].includes(event.kind) || event.at !== earliest.executeAt)) {
      throw new GameError('INVALID_PENDING_EVENT', 'A pending order has no matching execution event. Check the order before advancing.', 503);
    }
    return { earliest, pendingOrderCount, nextPendingExecution: event ? { at: event.at, kind: event.kind, market: event.market!, orderCount } : null };
  }

  async targets() {
    const { world, dataset, clock } = await this.context();
    const gameNow = clockTarget(clock, world, dataset.endsAt, this.now().getTime());
    const event = nextMarketEvent(dataset, gameNow);
    const pending = await this.pendingOrders(world, dataset);
    const pointer = await this.store.get<{ worldId: string }>('system/current');
    const latest = await this.store.get<World>(`worlds/${world.id}`);
    if (pointer?.worldId !== world.id || latest?.revision !== world.revision || latest?.status !== world.status) throw new GameError('WORLD_CHANGED', 'The world changed while loading clock targets. Refresh the controls.', 409, true);
    return { worldId: world.id, gameNow, nextMarketEvent: event ? { at: event.at, kind: event.kind, market: event.market! } : null,
      nextPendingExecution: pending.nextPendingExecution, pendingOrderCount: pending.pendingOrderCount };
  }

  // receipt lookup reads saved state only; it never starts or advances clock work.
  async requestStatus(key: string, requestedWorldId?: string) {
    const pointer = requestedWorldId ? undefined : await this.store.get<{ worldId: string }>('system/current');
    const worldId = requestedWorldId ?? pointer?.worldId;
    if (!worldId) return { accepted: false as const, requestKey: key, worldId: null };
    const saved = await this.store.get<ClockRequest>(`worlds/${worldId}/clockRequests/${hash(key)}`);
    if (!saved) return { accepted: false as const, requestKey: key, worldId };
    const world = await this.store.get<World>(`worlds/${worldId}`);
    const clock = await this.store.get<WorldClock>(clockPath(worldId));
    const audit = await this.store.get<{ at: string; after: WorldClock }>(`worlds/${worldId}/clockAudit/${hash(key)}`);
    const target = saved.target ?? audit?.after.anchorGameAt ?? saved.input.target ?? world?.now ?? null;
    const clockVersion = saved.clockVersion ?? audit?.after.version ?? null;
    const due = world && target && dueEvents(this.datasets.get(world.datasetId), world.now, target).length > 0;
    const processingStatus = clock && clockVersion !== null && clock.version > clockVersion ? 'superseded'
      : world?.status === 'advancing' || due ? 'syncing' : world ? 'completed' : 'accepted';
    return { accepted: true as const, requestKey: key, worldId, action: saved.input.action, target, requestedAt: saved.requestedAt ?? audit?.at ?? null, clockVersion, processingStatus };
  }

  async configure(actor: string, input: ClockInput, key: string) {
    const initial = await this.context();
    const requestPath = `worlds/${input.worldId}/clockRequests/${hash(key)}`;
    const previousRequest = await this.store.get<ClockRequest>(requestPath);
    const pending = input.action === 'next_order' && !previousRequest ? await this.pendingOrders(initial.world, initial.dataset) : null;
    await this.store.transaction(async tx => {
      const pointer = await tx.get<{ worldId: string }>('system/current');
      const world = pointer && await tx.get<World>(`worlds/${pointer.worldId}`);
      const saved = await tx.get<ClockRequest>(requestPath);
      if (saved) {
        if (saved.actor !== actor || JSON.stringify(saved.input) !== JSON.stringify(input)) throw new GameError('IDEMPOTENCY_CONFLICT', 'This clock request was already used for another action.', 409);
        return;
      }
      if (!world || world.id !== input.worldId || world.id !== initial.world.id) throw new GameError('WORLD_CHANGED', 'The world changed. Refresh the clock controls.', 409, true);
      if (world.status !== 'idle') throw new GameError('WORLD_ADVANCING', 'Clock synchronization is in progress. Wait for completion or resume the saved job.', 423, true);
      const before = await tx.get<WorldClock>(clockPath(world.id));
      if (!before) throw new GameError('CLOCK_UNAVAILABLE', 'Reload the clock controls.', 503, true);
      const dataset = this.datasets.get(world.datasetId);
      const serverNow = this.now().toISOString();
      const currentTarget = clockTarget(before, world, dataset.endsAt, Date.parse(serverNow));
      const pendingOrder = pending?.earliest ? await tx.get<Order>(`worlds/${world.id}/players/${pending.earliest.uid}/orders/${pending.earliest.id}`) : null;
      let target = currentTarget;
      if (input.action === 'set') {
        if (input.targetIsrael) target = israelTarget(input.targetIsrael);
        else {
          if (!input.target || !Number.isFinite(Date.parse(input.target))) throw new GameError('INVALID_TIME', 'Choose a valid game date with a time zone.', 400);
          target = new Date(input.target).toISOString();
        }
      } else if (input.action === 'next') {
        const next = nextMarketEvent(dataset, currentTarget);
        if (!next) throw new GameError('DATASET_FINISHED', 'No future market event remains. Create a separate historical test world to start earlier.', 422);
        target = next.at;
      } else if (input.action === 'next_order') {
        if (!pendingOrder || pendingOrder.status !== 'pending') throw new GameError('NO_PENDING_ORDERS', 'There are no pending orders to execute. Submit an order, or advance to the next market event.', 422);
        target = pendingOrder.executeAt;
        if (Date.parse(target) < Date.parse(currentTarget)) throw new GameError('CLOCK_SYNCING', 'The server is completing this pending order. Refresh its status shortly.', 423, true);
      }
      if (Date.parse(target) < Date.parse(currentTarget)) throw new GameError('CLOCK_BACKWARD', 'A world cannot move backwards. Create a separate test world for an earlier date.', 422);
      if (Date.parse(target) > Date.parse(dataset.endsAt)) throw new GameError('DATASET_FINISHED', 'The selected time is outside the historical price period.', 422);
      // a time jump pauses the clock so the admin can inspect the result.
      const after: WorldClock = { ...before, running: input.action === 'resume',
        anchorGameAt: target, anchorServerAt: serverNow, version: before.version + 1, updatedAt: serverNow, updatedBy: actor };
      tx.set(clockPath(world.id), after);
      tx.set(requestPath, { input, actor, target, requestedAt: serverNow, clockVersion: after.version });
      tx.set(`worlds/${world.id}/clockAudit/${hash(key)}`, { actor, action: input.action, at: serverNow, before, after });
    });
    await this.pending;
    this.checkedAt = 0;
    await this.synchronize();
    return { world: await this.getWorld() };
  }

  async jump(actor: string, target: string, key: string, worldId: string) {
    await this.configure(actor, { worldId, action: 'set', target }, key);
    const world = await this.game.getWorld();
    return { worldId: world.id, revision: world.revision, status: world.status, job: world.job };
  }

  async audit() {
    const { world } = await this.context();
    return { worldId: world.id, entries: (await this.store.list(`worlds/${world.id}/clockAudit`, { orderBy: 'at', direction: 'desc', limit: 25 })).map(row => row.data) };
  }

  invalidate() { this.checkedAt = 0; }
}
