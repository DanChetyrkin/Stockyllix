export type NewsMarket = 'all' | 'stocks' | 'forex' | 'indices' | 'crypto' | 'futures';

export const newsMarkets: { value: NewsMarket; label: string }[] = [
  { value: 'all', label: 'All markets' },
  { value: 'stocks', label: 'Stocks' },
  { value: 'forex', label: 'Currencies' },
  { value: 'indices', label: 'Indices' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'futures', label: 'Futures' },
];

// provider symbols are independent of the historical game's price dates.
export const newsStocks = [
  ['NASDAQ:AAPL', 'Apple'], ['NASDAQ:MSFT', 'Microsoft'], ['NASDAQ:AMZN', 'Amazon'],
  ['NASDAQ:GOOGL', 'Alphabet'], ['NASDAQ:NVDA', 'NVIDIA'], ['NASDAQ:META', 'Meta'],
  ['NYSE:JPM', 'JPMorgan'], ['NYSE:JNJ', 'Johnson & Johnson'], ['NYSE:KO', 'Coca-Cola'],
  ['AMEX:SPY', 'S&P 500 ETF'], ['TASE:LUMI', 'Bank Leumi'], ['TASE:POLI', 'Bank Hapoalim'],
  ['TASE:MZTF', 'Mizrahi Tefahot'], ['TASE:DSCT', 'Discount Bank'], ['TASE:BEZQ', 'Bezeq'],
  ['TASE:AZRG', 'Azrieli'], ['TASE:ESLT', 'Elbit Systems'], ['TASE:ICL', 'ICL'],
  ['TASE:TEVA', 'Teva'], ['TASE:NICE', 'NICE'],
] as const;

export interface ProviderWidgetProps {
  kind: 'markets' | 'news';
  newsMarket?: NewsMarket;
  newsSymbol?: string;
}

export function newsSourceUrl(symbol?: string) {
  return symbol && newsStocks.some(([value]) => value === symbol)
    ? `https://www.tradingview.com/symbols/${symbol.replace(':', '-')}/news/`
    : 'https://www.tradingview.com/news/';
}
