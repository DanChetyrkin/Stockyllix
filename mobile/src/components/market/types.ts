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
