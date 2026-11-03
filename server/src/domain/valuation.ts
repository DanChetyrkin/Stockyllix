import Decimal from 'decimal.js';
import type { Dataset, MarketSnapshot, Portfolio, WeekStats } from './model.js';

export const decimal = (value: Decimal.Value) => new Decimal(value);

export function instrumentPriceILS(dataset: Dataset, snapshot: MarketSnapshot, instrumentId: string): Decimal {
  const instrument = dataset.instruments.find((item) => item.id === instrumentId);
  const price = snapshot.prices[instrumentId];
  if (!instrument || !price || !decimal(price).isPositive()) throw new Error(`missing price: ${instrumentId}`);
  return decimal(price).mul(instrument.currency === 'USD' ? snapshot.fx : 1);
}

export function portfolioValue(dataset: Dataset, snapshot: MarketSnapshot, portfolio: Portfolio): Decimal {
  let value = decimal(portfolio.cashAgorot).div(100);
  for (const [instrumentId, holding] of Object.entries(portfolio.holdings)) {
    value = value.add(decimal(holding.units).mul(instrumentPriceILS(dataset, snapshot, instrumentId)));
  }
  return value;
}

export function weeklyReturn(value: Decimal.Value, week: WeekStats): Decimal {
  return decimal(value).div(week.startValueILS).sub(1).mul(100);
}

export function sampleWeek(week: WeekStats, value: Decimal.Value): WeekStats {
  const current = decimal(value);
  const peak = Decimal.max(week.peakValueILS, current);
  const drawdown = peak.isZero() ? decimal(0) : peak.sub(current).div(peak);
  return { ...week, peakValueILS: peak.toFixed(12), mddRatio: Decimal.max(week.mddRatio, drawdown).toFixed(16) };
}

export function portfolioSummary(dataset: Dataset, snapshot: MarketSnapshot, portfolio: Portfolio) {
  const value = portfolioValue(dataset, snapshot, portfolio);
  return {
    valueILS: value.toFixed(2),
    cashILS: decimal(portfolio.cashAgorot).div(100).toFixed(2),
    availableCashILS: decimal(portfolio.cashAgorot - portfolio.reservedCashAgorot).div(100).toFixed(2),
    reservedCashILS: decimal(portfolio.reservedCashAgorot).div(100).toFixed(2),
    weeklyReturnPct: weeklyReturn(value, portfolio.week).toFixed(6),
    mddPct: decimal(portfolio.week.mddRatio).mul(100).toFixed(6),
    eligible: portfolio.week.eligible,
    holdings: Object.entries(portfolio.holdings).map(([instrumentId, holding]) => {
      const priceILS = instrumentPriceILS(dataset, snapshot, instrumentId);
      const holdingValue = decimal(holding.units).mul(priceILS);
      return {
        instrumentId, ...holding, priceILS: priceILS.toFixed(8), valueILS: holdingValue.toFixed(2),
        weightPct: value.isZero() ? '0.0000' : holdingValue.div(value).mul(100).toFixed(4),
      };
    }),
  };
}
