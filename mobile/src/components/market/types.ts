export interface PricePoint {
  at: string;
  price: string;
  kind: 'baseline' | 'open' | 'close';
}
export interface PriceHistory {
  worldId: string;
  revision: number;
  instrumentId: string;
  currency: 'ILS' | 'USD';
  dataMode: 'simulated' | 'historical';
  sourceDescription: string;
  asOf: string;
  latestPrice: string;
  dailyChangePct: string | null;
  previousCloseAt: string | null;
  points: PricePoint[];
}
export type WatchDirection = 'at_or_below' | 'at_or_above';
export interface WatchItem {
  instrumentId: string;
  symbol: string;
  name: string;
  currency: 'ILS' | 'USD';
  targetPrice: string;
  direction: WatchDirection;
  currentPrice: string;
  reached: boolean;
  updatedAt: string;
}
export interface WatchlistResponse {
  worldId: string;
  revision: number;
  asOf: string;
  items: WatchItem[];
}
