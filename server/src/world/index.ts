import { createHash } from 'node:crypto';
import { Decimal } from 'decimal.js';
import { DateTime } from 'luxon';
import type { Dataset, EventKind, Market, MarketSnapshot, TradingSession, WorldEvent } from '../domain/model.js';
import { initialPrices, instruments } from './catalog.js';

export interface FxRow {
  date: string;
  rate: string;
  availableAt: string;
  source: 'ecb' | 'boi' | 'simulated';
}

export const WORLD_ZONE = 'Asia/Jerusalem';
export const DATA_START = '2026-10-05T00:00:00';
export const DATA_LAST_DATE = '2026-11-02';

function parseInstant(value: string): DateTime {
  const instant = DateTime.fromISO(value, { setZone: true });
  if (!instant.isValid || !/(Z|[+-]\d{2}:\d{2})$/.test(value)) throw new Error(`Invalid timestamp with timezone: ${value}`);
  return instant;
}

function utc(value: DateTime): string {
  const result = value.toUTC().toISO({ suppressMilliseconds: true });
  if (!result) throw new Error('Cannot format an invalid timestamp');
  return result;
}

export function getWeekId(at: string): string {
  const local = parseInstant(at).setZone(WORLD_ZONE);
  return local.minus({ days: local.weekday - 1 }).toISODate()!;
}

export function isEligibleJoin(at: string): boolean {
  const local = parseInstant(at).setZone(WORLD_ZONE);
  return local.weekday === 1 && local.hour < 10;
}

// the assignment's hours define the simulation; actual exchange holidays are not inferred
export function buildSession(date: string, market: Market): TradingSession | null {
  const zone = market === 'TA' ? WORLD_ZONE : 'America/New_York';
  const localDate = DateTime.fromISO(date, { zone });
  if (!localDate.isValid || localDate.toISODate() !== date) throw new Error(`Invalid session date: ${date}`);
  if (localDate.weekday > 5) return null;
  const opensAt = localDate.set(market === 'TA' ? { hour: 10 } : { hour: 9, minute: 30 });
  const closesAt = localDate.set(market === 'TA'
    ? localDate.weekday === 5 ? { hour: 13, minute: 50 } : { hour: 17, minute: 30 }
    : { hour: 16 });
  return { id: `${market}:${date}`, market, date, opensAt: utc(opensAt), closesAt: utc(closesAt) };
}

export function isMarketOpen(dataset: Dataset, market: Market, at: string): boolean {
  const now = parseInstant(at).toMillis();
  return dataset.sessions.some((session) => session.market === market
    && Date.parse(session.opensAt) <= now && now < Date.parse(session.closesAt));
}

export function nextExecution(dataset: Dataset, instrumentId: string, now: string): WorldEvent | null {
  const instrument = dataset.instruments.find((item) => item.id === instrumentId);
  if (!instrument) return null;
  const current = parseInstant(now).toMillis();
  if (current < Date.parse(dataset.startsAt) || current >= Date.parse(dataset.endsAt)) return null;
  const active = dataset.sessions.find((session) => session.market === instrument.market
    && Date.parse(session.opensAt) <= current && current < Date.parse(session.closesAt));
  const next = active ?? dataset.sessions.find((session) => session.market === instrument.market && Date.parse(session.opensAt) > current);
  if (!next) return null;
  const kind: EventKind = active ? 'MARKET_CLOSE' : 'MARKET_OPEN';
  const at = active ? next.closesAt : next.opensAt;
  return dataset.events.find((event) => event.market === instrument.market && event.kind === kind && event.at === at) ?? null;
}

export function snapshotAt(dataset: Dataset, at: string): MarketSnapshot {
  const target = parseInstant(at).toMillis();
  if (target < Date.parse(dataset.startsAt) || target > Date.parse(dataset.endsAt)) throw new Error('Timestamp outside the dataset');
  let result = dataset.initialSnapshot;
  for (const event of dataset.events) {
    if (Date.parse(event.at) > target) break;
    result = event.snapshot;
  }
  return { ...result, prices: { ...result.prices } };
}

// keyed hashes give reproducible variation without exposing the private seed in the dataset
function noise(seed: string, key: string): number {
  const hash = createHash('sha256').update(`${seed}:${key}`).digest();
  return hash.readUInt32BE(0) / 0xffffffff * 2 - 1;
}

export function validateFxRows(rows: FxRow[]): FxRow[] {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('FX data must include observations');
  const dates = new Set<string>();
  const result = rows.map((row) => {
    if (typeof row !== 'object' || row === null || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)
      || !DateTime.fromISO(row.date).isValid || typeof row.rate !== 'string'
      || !/^\d+(\.\d+)?$/.test(row.rate) || !new Decimal(row.rate).gt(0)
      || !['ecb', 'boi', 'simulated'].includes(row.source)) throw new Error('Invalid FX observation');
    const available = parseInstant(row.availableAt);
    const observationDay = DateTime.fromISO(row.date, { zone: WORLD_ZONE }).startOf('day');
    if (available.toMillis() < observationDay.toMillis()) {
      throw new Error('FX observation is available before its observation date');
    }
    if (['ecb', 'boi'].includes(row.source) && available.toMillis() < observationDay.plus({ days: 1 }).toMillis()) {
      throw new Error('Reference FX availability must follow the conservative next-day policy');
    }
    if (dates.has(row.date)) throw new Error(`Duplicate FX date: ${row.date}`);
    dates.add(row.date);
    return { ...row };
  });
  return result.sort((a, b) => Date.parse(a.availableAt) - Date.parse(b.availableAt) || a.date.localeCompare(b.date));
}

function simulatedFx(seed: string, firstDate = '2026-10-02', lastDate = DATA_LAST_DATE): FxRow[] {
  const rows: FxRow[] = [];
  let rate = new Decimal('3.65');
  let date = DateTime.fromISO(firstDate, { zone: WORLD_ZONE });
  const last = DateTime.fromISO(lastDate, { zone: WORLD_ZONE });
  while (date <= last) {
    if (date.weekday <= 5) {
      rate = rate.mul(new Decimal(1).plus(noise(seed, `fx:${date.toISODate()}`) * 0.004));
      rows.push({ date: date.toISODate()!, rate: rate.toFixed(6), availableAt: utc(date.plus({ days: 1 }).startOf('day')), source: 'simulated' });
    }
    date = date.plus({ days: 1 });
  }
  return rows;
}

type DraftEvent = Omit<WorldEvent, 'snapshot'> & { changedPrices?: Record<string, string>; fxRow?: FxRow };
const EVENT_ORDER: Record<EventKind, number> = { WEEK_END: 0, WEEK_START: 1, FX: 2, MARKET_OPEN: 3, MARKET_CLOSE: 4 };

function compareEvents(a: Pick<WorldEvent, 'at' | 'kind' | 'id'>, b: Pick<WorldEvent, 'at' | 'kind' | 'id'>): number {
  return Date.parse(a.at) - Date.parse(b.at) || EVENT_ORDER[a.kind] - EVENT_ORDER[b.kind] || a.id.localeCompare(b.id);
}

export function createDataset(seed: string, suppliedFxRows?: FxRow[], testRange?: { startDate: string; days: 28 }): Dataset {
  if (!seed.trim()) throw new Error('A private dataset seed is required');
  const start = DateTime.fromISO(testRange?.startDate ?? DATA_START, { zone: WORLD_ZONE });
  const lastDate = testRange ? start.plus({ days: testRange.days }).minus({ milliseconds: 1 }).toISODate()! : DATA_LAST_DATE;
  const startsAt = utc(start);
  const endsAt = testRange ? utc(start.plus({ days: testRange.days }).minus({ milliseconds: 1 })) : buildSession(DATA_LAST_DATE, 'US')!.closesAt;
  const rows = validateFxRows(suppliedFxRows ?? (testRange ? simulatedFx(seed, start.minus({ days: 3 }).toISODate()!, lastDate) : simulatedFx(seed)));
  const initialFx = rows.filter((row) => Date.parse(row.availableAt) <= Date.parse(startsAt)).at(-1);
  if (!initialFx) throw new Error('FX data needs a rate available before world start');
  const sessions: TradingSession[] = [];
  const drafts: DraftEvent[] = [];
  const lastClose = { ...initialPrices };
  let day = start;
  while (day.toISODate()! <= lastDate) {
    const date = day.toISODate()!;
    if (day.weekday === 1 || day.weekday === 6) {
      const kind: EventKind = day.weekday === 1 ? 'WEEK_START' : 'WEEK_END';
      drafts.push({ id: `${kind}:${date}`, at: utc(day), kind, weekId: getWeekId(utc(day)) });
    }
    for (const market of ['TA', 'US'] as const) {
      const session = buildSession(date, market);
      if (!session) continue;
      sessions.push(session);
      const open: Record<string, string> = {};
      const close: Record<string, string> = {};
      const marketMove = noise(seed, `market:${market}:${date}`) * 0.012;
      for (const instrument of instruments.filter((item) => item.market === market)) {
        const overnight = noise(seed, `gap:${instrument.id}:${date}`) * 0.006;
        const sectorMove = noise(seed, `sector:${instrument.sector}:${date}`) * 0.006;
        const ownMove = noise(seed, `own:${instrument.id}:${date}`) * (instrument.id === 'SPY' ? 0.003 : 0.016);
        open[instrument.id] = new Decimal(lastClose[instrument.id]!).mul(1 + overnight).toFixed(6);
        close[instrument.id] = new Decimal(open[instrument.id]!).mul(1 + marketMove + sectorMove + ownMove).toFixed(6);
        lastClose[instrument.id] = close[instrument.id]!;
      }
      drafts.push({ id: `OPEN:${session.id}`, at: session.opensAt, kind: 'MARKET_OPEN', market, weekId: getWeekId(session.opensAt), changedPrices: open });
      drafts.push({ id: `CLOSE:${session.id}`, at: session.closesAt, kind: 'MARKET_CLOSE', market, weekId: getWeekId(session.closesAt), changedPrices: close });
    }
    day = day.plus({ days: 1 });
  }
  for (const row of rows) {
    if (Date.parse(row.availableAt) > Date.parse(startsAt) && Date.parse(row.availableAt) <= Date.parse(endsAt)) {
      drafts.push({ id: `FX:${row.date}`, at: row.availableAt, kind: 'FX', weekId: getWeekId(row.availableAt), fxRow: row });
    }
  }
  drafts.sort(compareEvents);
  let snapshot: MarketSnapshot = { at: startsAt, prices: { ...initialPrices }, fx: initialFx.rate, fxAsOf: initialFx.date };
  const initialSnapshot = { ...snapshot, prices: { ...snapshot.prices } };
  const events: WorldEvent[] = drafts.map((draft) => {
    snapshot = {
      at: draft.at, prices: { ...snapshot.prices, ...draft.changedPrices },
      fx: draft.fxRow?.rate ?? snapshot.fx, fxAsOf: draft.fxRow?.date ?? snapshot.fxAsOf,
    };
    return {
      id: draft.id, at: draft.at, kind: draft.kind, weekId: draft.weekId,
      ...(draft.market ? { market: draft.market } : {}), snapshot,
    };
  });
  const fxSource = rows.every((row) => row.source === 'boi') ? 'real historical Bank of Israel representative USD/ILS rates; available from the following Israel calendar day'
    : rows.every((row) => row.source === 'ecb') ? 'real historical ECB reference FX; available from the following Israel calendar day' : 'simulated FX, not market exchange rates';
  const contentHash = createHash('sha256').update(JSON.stringify({ initialSnapshot, events })).digest('hex').slice(0, 12);
  const dataset: Dataset = {
    id: testRange ? `test-sim-v1-${testRange.startDate}-${contentHash}` : `demo-oct2026-${contentHash}`, startsAt, endsAt, source: 'simulated',
    sourceDescription: testRange ? `Isolated test simulation from ${testRange.startDate}: all stock prices and USD/ILS rates are simulated, including the starting values. Assignment weekday hours; no actual exchange-holiday or corporate-action claims.`
      : `Real instrument names; simulated stock prices (including the October 2 baseline), ${fxSource}. Assignment weekday hours; no exchange-holiday claims.`,
    instruments: instruments.map((instrument) => ({ ...instrument })), sessions, initialSnapshot, events,
  };
  validateDataset(dataset);
  return dataset;
}

export function validateDataset(value: unknown): Dataset {
  if (typeof value !== 'object' || value === null) throw new Error('Dataset must be an object');
  const data = value as Dataset;
  if (typeof data.id !== 'string' || !data.id || !['simulated', 'historical'].includes(data.source)
    || typeof data.sourceDescription !== 'string' || !data.sourceDescription.trim()
    || !Array.isArray(data.instruments) || data.instruments.length !== 20 || !Array.isArray(data.sessions) || !Array.isArray(data.events)) {
    throw new Error('Invalid dataset header or instrument count');
  }
  const start = parseInstant(data.startsAt).toMillis();
  const end = parseInstant(data.endsAt).toMillis();
  if (start >= end) throw new Error('Invalid dataset time range');
  const ids = new Set<string>();
  for (const instrument of data.instruments) {
    if (!instrument || typeof instrument.id !== 'string' || !instrument.id || ids.has(instrument.id)
      || !['TA', 'US'].includes(instrument.market) || instrument.currency !== (instrument.market === 'TA' ? 'ILS' : 'USD')
      || !instrument.symbol || !instrument.name || !instrument.sector) throw new Error('Invalid or duplicate instrument');
    ids.add(instrument.id);
  }
  if (!data.instruments.some((item) => item.market === 'TA') || !data.instruments.some((item) => item.market === 'US')) throw new Error('Both markets are required');
  const validateSnapshot = (snapshot: MarketSnapshot, at: string) => {
    if (!snapshot || snapshot.at !== at || !snapshot.prices || typeof snapshot.fx !== 'string'
      || !/^\d+(\.\d+)?$/.test(snapshot.fx) || !new Decimal(snapshot.fx).gt(0)
      || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.fxAsOf) || !DateTime.fromISO(snapshot.fxAsOf).isValid
      || snapshot.fxAsOf > parseInstant(at).setZone(WORLD_ZONE).toISODate()!) throw new Error('Invalid snapshot or future FX date');
    const fxAgeDays = parseInstant(at).setZone(WORLD_ZONE).startOf('day')
      .diff(DateTime.fromISO(snapshot.fxAsOf, { zone: WORLD_ZONE }), 'days').days;
    if (fxAgeDays > 7) throw new Error('FX observation is more than seven calendar days old');
    if (Object.keys(snapshot.prices).length !== ids.size) throw new Error('Incomplete snapshot prices');
    for (const id of ids) {
      const price = snapshot.prices[id];
      if (typeof price !== 'string' || !/^\d+(\.\d+)?$/.test(price) || !new Decimal(price).gt(0)) throw new Error(`Invalid price for ${id}`);
    }
  };
  validateSnapshot(data.initialSnapshot, data.startsAt);
  const eventIds = new Set<string>();
  let previous: WorldEvent | undefined;
  for (const event of data.events) {
    const time = parseInstant(event.at).toMillis();
    if (!event.id || eventIds.has(event.id) || !Object.hasOwn(EVENT_ORDER, event.kind) || time < start || time > end
      || event.weekId !== getWeekId(event.at) || (previous && compareEvents(previous, event) > 0)) throw new Error('Invalid, duplicate, or unordered world event');
    if (event.kind.startsWith('MARKET_') && !['TA', 'US'].includes(event.market!)) throw new Error('Market event needs a market');
    validateSnapshot(event.snapshot, event.at);
    const priorSnapshot = previous?.snapshot ?? data.initialSnapshot;
    for (const instrument of data.instruments) {
      if (event.snapshot.prices[instrument.id] !== priorSnapshot.prices[instrument.id]
        && !(event.kind.startsWith('MARKET_') && event.market === instrument.market)) {
        throw new Error('A price changes outside its market event');
      }
    }
    if ((event.snapshot.fx !== priorSnapshot.fx || event.snapshot.fxAsOf !== priorSnapshot.fxAsOf) && event.kind !== 'FX') {
      throw new Error('An FX rate changes outside its publication event');
    }
    if (event.kind === 'WEEK_START' || event.kind === 'WEEK_END') {
      const local = parseInstant(event.at).setZone(WORLD_ZONE);
      if (local.weekday !== (event.kind === 'WEEK_START' ? 1 : 6)
        || local.hour !== 0 || local.minute !== 0 || local.second !== 0 || local.millisecond !== 0) {
        throw new Error('Invalid competition week boundary');
      }
    }
    eventIds.add(event.id);
    previous = event;
  }
  if (data.events.length === 0) throw new Error('Dataset needs events');
  const sessionIds = new Set<string>();
  for (const session of data.sessions) {
    if (!session || !session.id || sessionIds.has(session.id) || !['TA', 'US'].includes(session.market)) throw new Error('Invalid or duplicate session');
    const expected = buildSession(session.date, session.market);
    if (!expected || expected.opensAt !== session.opensAt || expected.closesAt !== session.closesAt
      || Date.parse(session.opensAt) < start || Date.parse(session.closesAt) > end) throw new Error('Session violates assignment calendar or range');
    for (const [kind, at] of [['MARKET_OPEN', session.opensAt], ['MARKET_CLOSE', session.closesAt]] as const) {
      if (data.events.filter((event) => event.kind === kind && event.market === session.market && event.at === at).length !== 1) {
        throw new Error(`Session lacks exactly one ${kind} event`);
      }
    }
    sessionIds.add(session.id);
  }
  if (sessionIds.size === 0) throw new Error('Dataset needs trading sessions');
  for (const event of data.events.filter((item) => item.kind.startsWith('MARKET_'))) {
    if (!data.sessions.some((session) => session.market === event.market
      && (event.kind === 'MARKET_OPEN' ? session.opensAt : session.closesAt) === event.at)) {
      throw new Error('Market event does not belong to a trading session');
    }
  }
  let boundaryDate = parseInstant(data.startsAt).setZone(WORLD_ZONE).startOf('day');
  while (boundaryDate.toMillis() <= end) {
    if (boundaryDate.toMillis() >= start && [1, 6].includes(boundaryDate.weekday)) {
      const kind: EventKind = boundaryDate.weekday === 1 ? 'WEEK_START' : 'WEEK_END';
      if (data.events.filter((event) => event.kind === kind && event.at === utc(boundaryDate)).length !== 1) {
        throw new Error('Dataset is missing a competition week boundary');
      }
    }
    boundaryDate = boundaryDate.plus({ days: 1 });
  }
  // simulated worlds have complete weekday sessions; imported history may omit exchange holidays
  if (data.source === 'simulated') {
    let date = parseInstant(data.startsAt).setZone(WORLD_ZONE).startOf('day');
    const last = parseInstant(data.endsAt).setZone(WORLD_ZONE).toISODate()!;
    while (date.toISODate()! <= last) {
      for (const market of ['TA', 'US'] as const) {
        const expected = buildSession(date.toISODate()!, market);
        if (expected && Date.parse(expected.opensAt) >= start && Date.parse(expected.closesAt) <= end
          && !sessionIds.has(expected.id)) throw new Error('Simulated dataset has a missing weekday session');
      }
      date = date.plus({ days: 1 });
    }
  }
  return data;
}
