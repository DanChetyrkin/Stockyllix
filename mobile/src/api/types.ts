export type Side = 'buy' | 'sell';
export type Market = 'TA' | 'US';

export interface ClockJob {
  id: string;
  target: string;
  stage: string;
  completedEvents: number;
  totalEvents: number;
  processedPortfolios: number;
  leaseUntil: number;
  lastError: string | null;
}

export interface World {
  id: string;
  now: string;
  revision: number;
  status: 'idle' | 'advancing';
  dataMode: 'simulated' | 'historical';
  sourceDescription: string;
  startsAt: string;
  endsAt: string;
  weekId: string;
  nextEvent: { at: string; kind: string; market?: Market } | null;
  job: ClockJob | null;
}

export interface Instrument {
  id: string;
  symbol: string;
  name: string;
  market: Market;
  currency: 'ILS' | 'USD';
  sector: string;
  price: string;
  priceILS: string;
  marketOpen: boolean;
  nextExecutionAt: string | null;
  nextExecutionKind: string | null;
}

export interface MarketResponse {
  worldId: string;
  revision: number;
  asOf: string;
  fx: string;
  fxAsOf: string;
  instruments: Instrument[];
}

export interface Portfolio {
  uid: string;
  displayName: string;
  cashAgorot: number;
  reservedCashAgorot: number;
  holdings: Record<string, { units: string; reservedUnits: string }>;
  pendingOrderIds: string[];
  week: { eligible: boolean; weekId: string; startValueILS: string; mddRatio: string };
  joinedAt: string;
}

export interface DailyReview {
  date: string;
  valueChangeILS: string;
  executedOrders: number;
  pendingOrders: number;
  lesson: string;
}

export interface PortfolioResponse {
  worldId: string;
  revision: number;
  portfolio: Portfolio;
  summary: { valueILS: string; availableCashILS: string; weeklyReturnPct: string; mddPct: string };
  dailyReview: DailyReview;
}

export interface Order {
  id: string;
  instrumentId: string;
  side: Side;
  amountAgorot: number;
  status: 'pending' | 'executed' | 'rejected';
  submittedAt: string;
  executeAt: string;
  fill?: { price: string; fx: string; units: string; executedAt: string };
  rejection?: { code: string; message: string };
}

export interface OrderInput {
  worldId: string;
  instrumentId: string;
  side: Side;
  amountILS: string;
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

export interface LeaderboardResponse {
  rows: LeaderboardRow[];
  total: number;
  page: number;
  pageSize: number;
  weekId: string;
  generation: string | null;
}
