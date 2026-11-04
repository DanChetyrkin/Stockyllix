import type { Transaction } from '../data/store.js';
import type { World } from './model.js';

export interface WorldClock {
  running: boolean;
  anchorGameAt: string;
  anchorServerAt: string;
  version: number;
  updatedAt: string;
  updatedBy: string;
}

export const clockPath = (worldId: string) => `worlds/${worldId}/clock/state`;

// elapsed server time advances the original historical dates, never today's prices.
export function clockTarget(clock: WorldClock, world: Pick<World, 'now'>, endsAt: string, serverNow: number): string {
  const elapsed = clock.running ? Math.max(0, serverNow - Date.parse(clock.anchorServerAt)) : 0;
  const target = Math.max(Date.parse(world.now), Date.parse(clock.anchorGameAt) + elapsed);
  return new Date(Math.min(target, Date.parse(endsAt))).toISOString();
}

// a world without a saved clock stays at its last processed event.
export async function readGameTime(tx: Transaction, world: Pick<World, 'id' | 'now'>, endsAt: string, serverNow: number): Promise<string> {
  const clock = await tx.get<WorldClock>(clockPath(world.id));
  return clock ? clockTarget(clock, world, endsAt, serverNow) : world.now;
}
