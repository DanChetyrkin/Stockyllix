import { Decimal } from 'decimal.js';
import type { Dataset, MarketSnapshot, Portfolio, WeekStats } from './model.js';

const PreciseDecimal = Decimal.clone({ precision: 40 });
export const decimal = (value: Decimal.Value) => new PreciseDecimal(value);

export function formatDecimal(value: Decimal.Value, places: number): string {
  const rounded = decimal(value).toDecimalPlaces(places);
  return (rounded.isZero() ? decimal(0) : rounded).toFixed(places);
}

export function canonicalValueILS(value: Decimal.Value): Decimal {
  return decimal(formatDecimal(value, 12));
}

export function instrumentPriceILS(dataset: Dataset, snapshot: MarketSnapshot, instrumentId: string): Decimal {
  const instrument = dataset.instruments.find((item) => item.id === instrumentId);
  const price = snapshot.prices[instrumentId];
  if (!instrument || !price || !decimal(price).isFinite() || decimal(price).lte(0)) throw new Error(`missing price: ${instrumentId}`);
  if (instrument.currency === 'USD' && (!decimal(snapshot.fx).isFinite() || decimal(snapshot.fx).lte(0))) throw new Error('missing or invalid exchange rate');
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
  return decimal(week.finalValueILS ?? value).div(week.startValueILS).sub(1).mul(100);
}

export function sampleWeek(week: WeekStats, value: Decimal.Value): WeekStats {
  if (week.finalValueILS !== undefined) return week;
  const current = decimal(value);
  const peak = Decimal.max(week.peakValueILS, current);
  const drawdown = peak.isZero() ? decimal(0) : peak.sub(current).div(peak);
  return { ...week, peakValueILS: peak.toFixed(12), mddRatio: Decimal.max(week.mddRatio, drawdown).toFixed(16) };
}

export function portfolioSummary(dataset: Dataset, snapshot: MarketSnapshot, portfolio: Portfolio) {
  const value = portfolioValue(dataset, snapshot, portfolio);
  return {
    valueILS: value.toFixed(2),
    holdingsValueILS: value.sub(decimal(portfolio.cashAgorot).div(100)).toFixed(2),
    cashILS: decimal(portfolio.cashAgorot).div(100).toFixed(2),
    cashWeightPct: value.isZero() ? '0.0000' : decimal(portfolio.cashAgorot).div(100).div(value).mul(100).toFixed(4),
    availableCashILS: decimal(portfolio.cashAgorot - portfolio.reservedCashAgorot).div(100).toFixed(2),
    reservedCashILS: decimal(portfolio.reservedCashAgorot).div(100).toFixed(2),
    weeklyReturnPct: formatDecimal(weeklyReturn(value, portfolio.week), 6),
    mddPct: formatDecimal(decimal(portfolio.week.mddRatio).mul(100), 6),
    eligible: portfolio.week.eligible,
    holdings: Object.entries(portfolio.holdings).map(([instrumentId, holding]) => {
      const priceILS = instrumentPriceILS(dataset, snapshot, instrumentId);
      const holdingValue = decimal(holding.units).mul(priceILS);
      return {
        instrumentId, ...holding, priceILS: priceILS.toFixed(8), valueILS: holdingValue.toFixed(2),
        maxSellAmountILS: decimal(holding.units).sub(holding.reservedUnits).mul(priceILS).toDecimalPlaces(2, Decimal.ROUND_DOWN).toFixed(2),
        weightPct: value.isZero() ? '0.0000' : holdingValue.div(value).mul(100).toFixed(4),
      };
    }),
  };
}
