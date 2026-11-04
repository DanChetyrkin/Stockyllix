import { createHash } from 'node:crypto';
import type { DocumentStore } from '../data/store.js';
import type { Dataset, World } from '../domain/model.js';
import { clockPath, clockTarget, type WorldClock } from '../domain/clock.js';
import { GameError } from '../domain/errors.js';
import { datasetRegistry, type DatasetRegistry } from '../world/registry.js';
import type { GameService } from './game-service.js';

type ClockAction = 'pause' | 'resume' | 'historical' | 'realtime' | 'set' | 'next';
interface ClockInput { worldId: string; action: ClockAction; target?: string }
interface Context { world: World; clock: WorldClock; dataset: Dataset }

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const realtimeReason = 'Real-time trading needs verified current execution prices and FX. This world contains dated historical prices. Keep historical playback, or create a separately verified real-time world.';

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
        clock = { mode: 'historical', running: this.options.autostart !== false,
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
    const due = dataset.events.some(event => Date.parse(event.at) > Date.parse(world.now) && Date.parse(event.at) <= Date.parse(targetNow));
    return { mode: clock.mode, running: clock.running && !finished, serverNow, targetNow,
      syncing: world.status === 'advancing' || due, finished, autoProgresses: true as const,
      realtimeAvailable: false as const, realtimeUnavailableReason: realtimeReason,
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
        const due = dataset.events.filter(event => Date.parse(event.at) > Date.parse(world.now) && Date.parse(event.at) <= Date.parse(target));
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
        // the durable job records the cause; keep its recovery controls readable.
        const entry = { event: 'clock_sync_failed', worldId: latest.id, jobId: latest.job.id, code: cause instanceof GameError ? cause.code : 'PROCESSING_FAILED' };
        if (this.options.logger) this.options.logger(entry);
        else process.stdout.write(`${JSON.stringify(entry)}\n`);
        return;
      }
      if (Date.now() - started >= (this.options.budgetMs ?? 8000)) return;
    }
  }

  async configure(actor: string, input: ClockInput, key: string) {
    if (input.action === 'realtime') throw new GameError('REALTIME_DATA_UNAVAILABLE', realtimeReason, 422);
    const initial = await this.context();
    const requestPath = `worlds/${initial.world.id}/clockRequests/${hash(key)}`;
    await this.store.transaction(async tx => {
      const pointer = await tx.get<{ worldId: string }>('system/current');
      const world = pointer && await tx.get<World>(`worlds/${pointer.worldId}`);
      const saved = await tx.get<{ input: ClockInput; actor: string }>(requestPath);
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
        if (!input.target || !Number.isFinite(Date.parse(input.target))) throw new GameError('INVALID_TIME', 'Choose a valid game date with a time zone.', 400);
        target = new Date(input.target).toISOString();
      } else if (input.action === 'next') {
        const next = dataset.events.find(event => ['MARKET_OPEN', 'MARKET_CLOSE'].includes(event.kind) && Date.parse(event.at) > Date.parse(currentTarget));
        if (!next) throw new GameError('DATASET_FINISHED', 'No future market event remains. Create a separate historical test world to start earlier.', 422);
        target = next.at;
      }
      if (Date.parse(target) < Date.parse(currentTarget)) throw new GameError('CLOCK_BACKWARD', 'A world cannot move backwards. Create a separate test world for an earlier date.', 422);
      if (Date.parse(target) > Date.parse(dataset.endsAt)) throw new GameError('DATASET_FINISHED', 'The selected time is outside the historical price period.', 422);
      const custom = input.action === 'set' || input.action === 'next';
      const after: WorldClock = { ...before, mode: custom ? 'custom' : input.action === 'historical' ? 'historical' : before.mode,
        running: custom || input.action === 'pause' ? false : true,
        anchorGameAt: target, anchorServerAt: serverNow, version: before.version + 1, updatedAt: serverNow, updatedBy: actor };
      tx.set(clockPath(world.id), after);
      tx.set(requestPath, { input, actor });
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
