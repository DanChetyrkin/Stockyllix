import type { Instrument } from '../domain/model.js';

// names are real; the game prices generated for them are simulated
export const instruments: Instrument[] = [
  { id: 'LUMI.TA', symbol: 'LUMI', name: 'Bank Leumi', market: 'TA', currency: 'ILS', sector: 'Banking' },
  { id: 'POLI.TA', symbol: 'POLI', name: 'Bank Hapoalim', market: 'TA', currency: 'ILS', sector: 'Banking' },
  { id: 'MZTF.TA', symbol: 'MZTF', name: 'Mizrahi Tefahot Bank', market: 'TA', currency: 'ILS', sector: 'Banking' },
  { id: 'DSCT.TA', symbol: 'DSCT', name: 'Israel Discount Bank', market: 'TA', currency: 'ILS', sector: 'Banking' },
  { id: 'BEZQ.TA', symbol: 'BEZQ', name: 'Bezeq', market: 'TA', currency: 'ILS', sector: 'Communication' },
  { id: 'AZRG.TA', symbol: 'AZRG', name: 'Azrieli Group', market: 'TA', currency: 'ILS', sector: 'Real estate' },
  { id: 'ESLT.TA', symbol: 'ESLT', name: 'Elbit Systems', market: 'TA', currency: 'ILS', sector: 'Defense' },
  { id: 'ICL.TA', symbol: 'ICL', name: 'ICL Group', market: 'TA', currency: 'ILS', sector: 'Materials' },
  { id: 'TEVA.TA', symbol: 'TEVA', name: 'Teva Pharmaceutical Industries', market: 'TA', currency: 'ILS', sector: 'Healthcare' },
  { id: 'NICE.TA', symbol: 'NICE', name: 'NICE', market: 'TA', currency: 'ILS', sector: 'Technology' },
  { id: 'AAPL', symbol: 'AAPL', name: 'Apple', market: 'US', currency: 'USD', sector: 'Technology' },
  { id: 'MSFT', symbol: 'MSFT', name: 'Microsoft', market: 'US', currency: 'USD', sector: 'Technology' },
  { id: 'AMZN', symbol: 'AMZN', name: 'Amazon', market: 'US', currency: 'USD', sector: 'Consumer' },
  { id: 'GOOGL', symbol: 'GOOGL', name: 'Alphabet', market: 'US', currency: 'USD', sector: 'Communication' },
  { id: 'NVDA', symbol: 'NVDA', name: 'NVIDIA', market: 'US', currency: 'USD', sector: 'Technology' },
  { id: 'META', symbol: 'META', name: 'Meta Platforms', market: 'US', currency: 'USD', sector: 'Communication' },
  { id: 'JPM', symbol: 'JPM', name: 'JPMorgan Chase', market: 'US', currency: 'USD', sector: 'Banking' },
  { id: 'JNJ', symbol: 'JNJ', name: 'Johnson & Johnson', market: 'US', currency: 'USD', sector: 'Healthcare' },
  { id: 'KO', symbol: 'KO', name: 'Coca-Cola', market: 'US', currency: 'USD', sector: 'Consumer' },
  { id: 'SPY', symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', market: 'US', currency: 'USD', sector: 'Broad market ETF' },
];

// these are illustrative starting prices in shekels or dollars, never exchange quotes
export const initialPrices: Record<string, string> = {
  'LUMI.TA': '72.40', 'POLI.TA': '68.20', 'MZTF.TA': '214.50', 'DSCT.TA': '36.80',
  'BEZQ.TA': '6.90', 'AZRG.TA': '352.00', 'ESLT.TA': '1560.00', 'ICL.TA': '20.60',
  'TEVA.TA': '73.40', 'NICE.TA': '402.50', AAPL: '243.00', MSFT: '516.00',
  AMZN: '232.00', GOOGL: '224.00', NVDA: '189.00', META: '734.00',
  JPM: '297.00', JNJ: '174.00', KO: '69.00', SPY: '645.00',
};
