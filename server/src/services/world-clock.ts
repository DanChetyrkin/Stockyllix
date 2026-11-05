import { DateTime } from 'luxon';
import { CURRENT_WORLD, keyHash, readCurrentWorld, worldPath } from '../data/current-world.js';
import type { DocumentStore } from '../data/store.js';
import type { Dataset, World } from '../domain/model.js';
import { clockPath, clockTarget, type WorldClock } from '../domain/clock.js';
import { GameError } from '../domain/errors.js';
import { dueEvents, nextMarketEvent } from '../world/index.js';
import { datasetRegistry, type DatasetRegistry } from '../world/registry.js';
import type { GameService } from './game-service.js';

type ClockAction = 'pause' | 'resume' | 'set' | 'next';
interface ClockInput { worldId: string; action: ClockAction; target?: string; targetIsrael?: { date: string; time: string } }
interface ClockRequest { input: ClockInput; actor: string; target?: string; requestedAt?: string; clockVersion?: number }
interface Context { world: World; clock: WorldClock; dataset: Dataset }


// one request may process many events, but never for longer than the time budget.
const MAX_SYNC_STEPS = 40;
const SYNC_BUDGET_MS = 8000;

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
    if (!await this.store.get(CURRENT_WORLD)) await this.game.getWorld();
    return this.store.transaction(async tx => {
      const world = await readCurrentWorld(tx);
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
    for (let index = 0; index < (this.options.maxSteps ?? MAX_SYNC_STEPS); index += 1) {
      const context = await this.context();
      const { world, dataset, clock } = context;
      if (world.job?.lastError && (world.job.retryAfter ?? 0) > this.now().getTime()) return;
      if (world.status === 'idle') {
        const target = clockTarget(clock, world, dataset.endsAt, this.now().getTime());
        const due = dueEvents(dataset, world.now, target);
        const advanceTo = due.at(-1)?.at ?? (Date.parse(target) >= Date.parse(dataset.endsAt) && Date.parse(world.now) < Date.parse(dataset.endsAt) ? dataset.endsAt : null);
        if (!advanceTo) return;
        try { await this.game.advance(advanceTo, `automatic-${keyHash(`${world.id}/${advanceTo}`)}`, world.id); }
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
      if (Date.now() - started >= (this.options.budgetMs ?? SYNC_BUDGET_MS)) return;
    }
  }

  // every order executes at a market opening or closing, so this is the next possible fill.
  async targets() {
    const { world, dataset, clock } = await this.context();
    const gameNow = clockTarget(clock, world, dataset.endsAt, this.now().getTime());
    const event = nextMarketEvent(dataset, gameNow);
    return { worldId: world.id, gameNow, nextMarketEvent: event ? { at: event.at, kind: event.kind, market: event.market! } : null };
  }

  // receipt lookup reads saved state only; it never starts or advances clock work.
  async requestStatus(key: string, requestedWorldId?: string) {
    const pointer = requestedWorldId ? undefined : await this.store.get<{ worldId: string }>(CURRENT_WORLD);
    const worldId = requestedWorldId ?? pointer?.worldId;
    if (!worldId) return { accepted: false as const, requestKey: key, worldId: null };
    const saved = await this.store.get<ClockRequest>(`${worldPath(worldId)}/clockRequests/${keyHash(key)}`);
    if (!saved) return { accepted: false as const, requestKey: key, worldId };
    const world = await this.store.get<World>(worldPath(worldId));
    const clock = await this.store.get<WorldClock>(clockPath(worldId));
    const audit = await this.store.get<{ at: string; after: WorldClock }>(`${worldPath(worldId)}/clockAudit/${keyHash(key)}`);
    const target = saved.target ?? audit?.after.anchorGameAt ?? saved.input.target ?? world?.now ?? null;
    const clockVersion = saved.clockVersion ?? audit?.after.version ?? null;
    const due = world && target && dueEvents(this.datasets.get(world.datasetId), world.now, target).length > 0;
    const processingStatus = clock && clockVersion !== null && clock.version > clockVersion ? 'superseded'
      : world?.status === 'advancing' || due ? 'syncing' : world ? 'completed' : 'accepted';
    return { accepted: true as const, requestKey: key, worldId, action: saved.input.action, target, requestedAt: saved.requestedAt ?? audit?.at ?? null, clockVersion, processingStatus };
  }

  async configure(actor: string, input: ClockInput, key: string) {
    const initial = await this.context();
    const requestPath = `${worldPath(input.worldId)}/clockRequests/${keyHash(key)}`;
    await this.store.transaction(async tx => {
      const world = await readCurrentWorld(tx);
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
      }
      if (Date.parse(target) < Date.parse(currentTarget)) throw new GameError('CLOCK_BACKWARD', 'A world cannot move backwards. Create a separate test world for an earlier date.', 422);
      if (Date.parse(target) > Date.parse(dataset.endsAt)) throw new GameError('DATASET_FINISHED', 'The selected time is outside the historical price period.', 422);
      // a time jump pauses the clock so the admin can inspect the result.
      const after: WorldClock = { ...before, running: input.action === 'resume',
        anchorGameAt: target, anchorServerAt: serverNow, version: before.version + 1, updatedAt: serverNow, updatedBy: actor };
      tx.set(clockPath(world.id), after);
      tx.set(requestPath, { input, actor, target, requestedAt: serverNow, clockVersion: after.version });
      tx.set(`${worldPath(world.id)}/clockAudit/${keyHash(key)}`, { actor, action: input.action, at: serverNow, before, after });
    });
    await this.pending;
    this.checkedAt = 0;
    await this.synchronize();
    return { world: await this.getWorld() };
  }

  async audit() {
    const { world } = await this.context();
    return { worldId: world.id, entries: (await this.store.list(`${worldPath(world.id)}/clockAudit`, { orderBy: 'at', direction: 'desc', limit: 25 })).map(row => row.data) };
  }

  invalidate() { this.checkedAt = 0; }
}
