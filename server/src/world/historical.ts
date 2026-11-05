import { createHash } from 'node:crypto';
import { DateTime } from 'luxon';
import type { Dataset, EventKind, Instrument, Market, MarketSnapshot, WorldEvent } from '../domain/model.js';
import { buildSession, getWeekId, validateDataset, validateFxRows, WORLD_ZONE, type FxRow } from './index.js';

export interface DailyBar { date: string; open: string; close: string }

const priority: Record<EventKind, number> = { WEEK_END: 0, WEEK_START: 1, FX: 2, MARKET_OPEN: 3, MARKET_CLOSE: 4 };
type Draft = Omit<WorldEvent, 'snapshot'> & { prices?: Record<string, string>; fx?: FxRow };
export interface HistoricalOptions {
  sourceDescription?: string;
  closedDates?: Partial<Record<Market, string[]>>;
}

export function buildHistoricalDataset(instruments: Instrument[], bars: Record<string, DailyBar[]>, fxRows: FxRow[], from: string, to: string, now = new Date(), options: HistoricalOptions = {}): Dataset {
  const first = DateTime.fromISO(from, { zone: WORLD_ZONE }).startOf('day');
  const lastSession = buildSession(to, 'US');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !first.isValid || first.weekday !== 1 || !lastSession || from > to || Date.parse(lastSession.closesAt) > now.getTime()) {
    throw new Error('Use a Monday start and a fully completed weekday end for the historical world');
  }
  const startsAt = first.toUTC().toISO({ suppressMilliseconds: true })!;
  const endsAt = lastSession.closesAt;
  for (const dates of Object.values(options.closedDates ?? {})) {
    if (new Set(dates).size !== dates.length || dates.some(date => !/^\d{4}-\d{2}-\d{2}$/.test(date) || !DateTime.fromISO(date).isValid)) throw new Error('Invalid or duplicate verified market closure');
  }
  const fx = validateFxRows(fxRows);
  const baselineFx = fx.filter(row => Date.parse(row.availableAt) <= Date.parse(startsAt)).at(-1);
  if (!baselineFx) throw new Error('Historical FX needs a rate available before the world starts');
  const prices: Record<string, string> = {};
  for (const instrument of instruments) {
    const baseline = bars[instrument.id]?.filter(bar => bar.date < from).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
    if (!baseline || DateTime.fromISO(from).diff(DateTime.fromISO(baseline.date), 'days').days > 7) throw new Error(`Missing recent baseline for ${instrument.symbol}`);
    prices[instrument.id] = baseline.close;
  }
  const drafts: Draft[] = [];
  const sessions = [];
  for (let day = first; day.toISODate()! <= to; day = day.plus({ days: 1 })) {
    const date = day.toISODate()!;
    const at = day.toUTC().toISO({ suppressMilliseconds: true })!;
    if ([1, 6].includes(day.weekday)) {
      const kind: EventKind = day.weekday === 1 ? 'WEEK_START' : 'WEEK_END';
      drafts.push({ id: `${kind}:${date}`, at, kind, weekId: getWeekId(at) });
    }
    for (const market of ['TA', 'US'] as const) {
      const session = buildSession(date, market);
      if (!session) continue;
      if (options.closedDates?.[market]?.includes(date)) {
        if (instruments.filter(instrument => instrument.market === market).some(instrument => bars[instrument.id]?.some(bar => bar.date === date))) throw new Error(`Prices conflict with the declared ${market} closure on ${date}`);
        continue;
      }
      const assets = instruments.filter(instrument => instrument.market === market);
      const observations = assets.map(instrument => ({ instrument, bar: bars[instrument.id]?.find(bar => bar.date === date) }));
      // absence is ambiguous; the importer requires complete dates instead of guessing holidays.
      if (observations.some(item => !item.bar)) throw new Error(`Missing ${market} prices on ${date}; choose a complete period or supply a verified trading calendar`);
      sessions.push(session);
      for (const kind of ['MARKET_OPEN', 'MARKET_CLOSE'] as const) {
        const eventAt = kind === 'MARKET_OPEN' ? session.opensAt : session.closesAt;
        const changed = Object.fromEntries(observations.map(({ instrument, bar }) => [instrument.id, kind === 'MARKET_OPEN' ? bar!.open : bar!.close]));
        drafts.push({ id: `${kind}:${session.id}`, at: eventAt, kind, market, weekId: getWeekId(eventAt), prices: changed });
      }
    }
  }
  // each fx rate becomes usable only when published, so no order sees a later rate.
  for (const row of fx) if (Date.parse(row.availableAt) > Date.parse(startsAt) && Date.parse(row.availableAt) <= Date.parse(endsAt)) drafts.push({ id: `FX:${row.date}`, at: row.availableAt, kind: 'FX', weekId: getWeekId(row.availableAt), fx: row });
  drafts.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || priority[a.kind] - priority[b.kind] || a.id.localeCompare(b.id));
  let snapshot: MarketSnapshot = { at: startsAt, prices, fx: baselineFx.rate, fxAsOf: baselineFx.date };
  const initialSnapshot = structuredClone(snapshot);
  const events: WorldEvent[] = drafts.map(draft => {
    snapshot = { at: draft.at, prices: { ...snapshot.prices, ...draft.prices }, fx: draft.fx?.rate ?? snapshot.fx, fxAsOf: draft.fx?.date ?? snapshot.fxAsOf };
    return { id: draft.id, at: draft.at, kind: draft.kind, weekId: draft.weekId, ...(draft.market ? { market: draft.market } : {}), snapshot };
  });
  const sourceDescription = options.sourceDescription ?? 'Historical daily opening and closing prices with Bank of Israel USD/ILS, replayed on the assignment trading hours. Each rate is usable from the following Israel day; no live or future prices are used.';
  const hash = createHash('sha256').update(JSON.stringify({ instruments, initialSnapshot, events, sourceDescription, closedDates: options.closedDates ?? {} })).digest('hex').slice(0, 16);
  return validateDataset({ id: `historical-${hash}`, startsAt, endsAt, source: 'historical',
    sourceDescription,
    instruments, sessions, initialSnapshot, events });
}
