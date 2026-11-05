import { createHash } from 'node:crypto';
import { GameError } from '../domain/errors.js';
import type { World } from '../domain/model.js';
import type { Transaction } from './store.js';

// one place for the document paths that every service shares.
export const CURRENT_WORLD = 'system/current';
export const worldPath = (worldId: string) => `worlds/${worldId}`;
export const playerPath = (worldId: string, uid: string) => `${worldPath(worldId)}/players/${uid}`;

// request keys become fixed-length document ids, so a retry finds the saved result.
export const keyHash = (value: string) => createHash('sha256').update(value).digest('hex');

// the pointer names the world all players see; a new game only moves the pointer.
export async function readCurrentWorld(reader: Pick<Transaction, 'get'>): Promise<World | undefined> {
  const pointer = await reader.get<{ worldId: string }>(CURRENT_WORLD);
  return pointer ? reader.get<World>(worldPath(pointer.worldId)) : undefined;
}

// player reads wait until the clock job has applied every reached event.
export async function readIdleWorld(reader: Pick<Transaction, 'get'>): Promise<World> {
  const world = await readCurrentWorld(reader);
  if (!world) throw new GameError('WORLD_NOT_FOUND', 'The game world is not available. Refresh and try again.', 503, true);
  if (world.status !== 'idle') throw new GameError('WORLD_ADVANCING', 'The game clock is processing events. Try again when it finishes.', 423, true);
  return world;
}
