export type ClockAction = 'pause' | 'resume' | 'set' | 'next';
export interface IsraelDateTime {
  date: string;
  time: string;
}
export interface ClockRequest {
  action: ClockAction;
  target?: string;
  targetIsrael?: IsraelDateTime;
  key: string;
  worldId: string;
}

// utils have no runtime imports, so node's test runner can load them directly.
export function validCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const clockActionLabels: Record<ClockAction, string> = {
  pause: 'Pause clock',
  resume: 'Resume clock',
  set: 'Set game time',
  next: 'Next opening or closing',
};

export function validIsraelDateTime(value: IsraelDateTime) {
  return validCalendarDate(value.date) && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.time);
}

// the server converts these israel wall-clock fields and checks daylight saving.
export function israelDateTime(value: string): IsraelDateTime {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (name: string) => parts.find(item => item.type === name)?.value || '';
  return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}` };
}

export function suggestedGameTime(gameAt: string, endsAt: string): IsraelDateTime {
  const target = Math.min(Date.parse(gameAt) + 60_000, Date.parse(endsAt));
  return israelDateTime(new Date(target).toISOString());
}

export function parseClockRequest(value: string | null): ClockRequest | null {
  if (value === null) return null;
  const request: unknown = JSON.parse(value);
  if (!request || typeof request !== 'object') throw new Error('Invalid clock request.');
  const input = request as Record<string, unknown>;
  if (
    typeof input.worldId !== 'string' ||
    !input.worldId ||
    typeof input.key !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.key) ||
    typeof input.action !== 'string' ||
    !Object.prototype.hasOwnProperty.call(clockActionLabels, input.action)
  )
    throw new Error('Invalid clock request.');
  if (input.action === 'set') {
    const local = input.targetIsrael as IsraelDateTime | undefined;
    const iso = input.target;
    if (
      Boolean(local) === Boolean(iso) ||
      (local && !validIsraelDateTime(local)) ||
      (iso && (typeof iso !== 'string' || !Number.isFinite(Date.parse(iso)) || !/(Z|[+-]\d{2}:\d{2})$/i.test(iso)))
    )
      throw new Error('Invalid saved clock target.');
  } else if (input.target !== undefined || input.targetIsrael !== undefined)
    throw new Error('Unexpected clock target.');
  return input as unknown as ClockRequest;
}
