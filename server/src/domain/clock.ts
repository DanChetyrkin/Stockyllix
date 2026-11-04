import type { World } from './model.js';

export interface WorldClock {
  mode: 'historical' | 'custom' | 'realtime';
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
