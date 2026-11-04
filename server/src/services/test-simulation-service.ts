import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { DocumentStore } from '../data/store.js';
import type { World } from '../domain/model.js';
import { GameError } from '../domain/errors.js';
import { createWorld, type GameService } from './game-service.js';
import type { DatasetRegistry } from '../world/registry.js';
import { createTestSimulation, restoreTestSimulation, validateSimulationDate, type TestSimulationDescriptor } from '../world/test-simulation.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

// only the administrator's isolated store and registry are supplied here.
export class TestSimulationService {
  constructor(private readonly store: DocumentStore, private readonly datasets: DatasetRegistry) {}

  async hydrate() {
    const rows = await this.store.list<TestSimulationDescriptor>('testDatasets');
    for (const row of rows) this.datasets.register(restoreTestSimulation(row.data));
  }

  async create(game: GameService, actor: string, key: string, worldId: string, startDate: string) {
    validateSimulationDate(startDate);
    const candidate = createTestSimulation(startDate, randomBytes(32).toString('hex'));
    this.datasets.register(candidate.dataset);
    const result = await this.store.transaction(async tx => {
      const requestPath = `adminRequests/${hash(key)}`;
      const existing = await tx.get<{ worldId: string; actor?: string; simulationInput?: { startDate: string; worldId: string }; descriptorId?: string }>(requestPath);
      const previousWorld = existing && await tx.get<World>(`worlds/${existing.worldId}`);
      const previousDescriptor = existing?.descriptorId && await tx.get<TestSimulationDescriptor>(`testDatasets/${existing.descriptorId}`);
      if (existing) {
        if (existing.actor !== actor || existing.simulationInput?.startDate !== startDate || existing.simulationInput.worldId !== worldId || !previousWorld || !previousDescriptor) {
          throw new GameError('IDEMPOTENCY_CONFLICT', 'This new-world request was already used for another action.', 409);
        }
        return { world: previousWorld, descriptor: previousDescriptor };
      }
      const pointer = await tx.get<{ worldId: string }>('system/current');
      if (pointer?.worldId !== worldId) throw new GameError('WORLD_CHANGED', 'The active world changed. Refresh before creating a separate test world.', 409, true);
      const current = await tx.get<World>(`worlds/${worldId}`);
      if (current?.status !== 'idle') throw new GameError('WORLD_ADVANCING', 'Finish the current clock synchronization before starting another test world.', 423, true);
      const world = createWorld(candidate.dataset, `world-${randomUUID()}`);
      tx.set(`testDatasets/${candidate.dataset.id}`, candidate.descriptor);
      tx.set(`worlds/${world.id}`, world);
      tx.set('system/current', { worldId: world.id });
      tx.set(requestPath, { worldId: world.id, actor, simulationInput: { startDate, worldId, days: 28 }, descriptorId: candidate.dataset.id });
      return { world, descriptor: candidate.descriptor };
    });
    this.datasets.register(restoreTestSimulation(result.descriptor));
    return game.describeWorld(result.world);
  }
}
