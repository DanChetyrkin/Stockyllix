export interface CurrentQuote {
  instrumentId: string; symbol: string; name: string; market: 'TA' | 'US';
  currency: 'ILS' | 'USD'; providerCurrency: string | null; price: string | null;
  previousClose: string | null; changePercent: string | null;
  priceAt: string | null; fetchedAt: string | null; exchangeTimezone: string;
  sourceUrl: string; session: 'regular'; timeliness: 'delayed' | 'unknown';
  delayMinutes: number | null; marketState: 'open' | 'closed' | 'unknown';
  stale: boolean; failureCode: string | null;
}

export interface CurrentMarketFeed {
  source: 'yahoo'; quotes: CurrentQuote[]; fetchedAt: string | null;
  stale: boolean; refreshing: boolean; nextRefreshAt: string; failureCode: string | null;
  status: 'ready' | 'partial' | 'unavailable'; access: 'admin' | 'public';
}

export interface NewsArticle {
  id: string; title: string; source: string; sourceHost: string; publishedAt: string;
  url: string; relatedInstrumentIds: string[];
}

export interface NewsResponse {
  provider: 'alpha-vantage'; timeBasis: 'real-world'; access: 'admin' | 'public';
  value: { articles: NewsArticle[] } | null; fetchedAt: string | null;
  stale: boolean; refreshing: boolean; nextRefreshAt: string; failureCode: string | null;
}
