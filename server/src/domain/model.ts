export type Market = 'TA' | 'US';
export type Side = 'buy' | 'sell';

export interface Instrument {
  id: string;
  symbol: string;
  name: string;
  market: Market;
  currency: 'ILS' | 'USD';
  sector: string;
}

export interface MarketSnapshot {
  at: string;
  prices: Record<string, string>;
  fx: string;
  fxAsOf: string;
}

export interface TradingSession {
  id: string;
  market: Market;
  date: string;
  opensAt: string;
  closesAt: string;
}

export type EventKind = 'MARKET_OPEN' | 'MARKET_CLOSE' | 'FX' | 'WEEK_START' | 'WEEK_END';

export interface WorldEvent {
  id: string;
  at: string;
  kind: EventKind;
  market?: Market;
  weekId: string;
  snapshot: MarketSnapshot;
}

export interface Dataset {
  id: string;
  startsAt: string;
  endsAt: string;
  source: 'simulated' | 'historical';
  sourceDescription: string;
  instruments: Instrument[];
  sessions: TradingSession[];
  initialSnapshot: MarketSnapshot;
  events: WorldEvent[];
}

export interface WeekStats {
  weekId: string;
  startValueILS: string;
  peakValueILS: string;
  mddRatio: string;
  eligible: boolean;
  finalValueILS?: string;
}

export interface Holding {
  units: string;
  reservedUnits: string;
}

export interface Portfolio {
  uid: string;
  displayName: string;
  cashAgorot: number;
  reservedCashAgorot: number;
  holdings: Record<string, Holding>;
  pendingOrderIds: string[];
  pendingBuyAgorot: Record<string, number>;
  nextSequence: number;
  week: WeekStats;
  lastEventId: string | null;
  joinedAt: string;
  createdAt: string;
}

export interface Order {
  id: string;
  uid: string;
  worldId: string;
  instrumentId: string;
  side: Side;
  amountAgorot: number;
  sequence: number;
  status: 'pending' | 'executed' | 'rejected';
  submittedAt: string;
  createdAt: string;
  executeEventId: string;
  executeAt: string;
  requestKey: string;
  reservedUnits?: string;
  fill?: { price: string; fx: string; units: string; executedAt: string };
  rejection?: { code: string; message: string };
}

export interface ClockJob {
  id: string;
  target: string;
  requestKey: string;
  fence: number;
  leaseOwner: string | null;
  leaseUntil: number;
  eventIndex: number;
  afterUid: string | null;
  stage: 'events' | 'leaderboard';
  completedEvents: number;
  totalEvents: number;
  processedPortfolios: number;
  lastError: string | null;
  createdAt: string;
}

export interface World {
  id: string;
  now: string;
  revision: number;
  status: 'idle' | 'advancing';
  snapshot: MarketSnapshot;
  datasetId: string;
  job: ClockJob | null;
  leaderboardGeneration: string | null;
  weekId: string;
}

export interface Valuation {
  uid: string;
  eventId: string;
  at: string;
  valueILS: string;
  weekId: string;
  weeklyReturnPct: string;
  mddPct: string;
}

export interface LeaderboardRow {
  uid: string;
  displayName: string;
  valueILS: string;
  weeklyReturnPct: string;
  mddPct: string;
  returnPercentile: string;
  stabilityPercentile: string;
  score: string;
  rank: number;
  eligible: boolean;
}

export interface OrderInput {
  worldId: string;
  instrumentId: string;
  side: Side;
  amountILS: string;
}
