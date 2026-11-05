import { Decimal } from 'decimal.js';
import { GameError } from './errors.js';
import type { Dataset, Order, Portfolio, WorldEvent } from './model.js';
import { canonicalValueILS, decimal, instrumentPriceILS, portfolioValue } from './valuation.js';

const MAX_PENDING_ORDERS = 20;
const UNIT_DECIMALS = 18;

export function parseAmount(amountILS: string): number {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(amountILS)) throw new GameError('INVALID_AMOUNT', 'Enter a positive ILS amount with at most two decimals.', 400);
  const amount = decimal(amountILS).mul(100);
  if (amount.lte(0) || !amount.isInteger() || amount.gt(Number.MAX_SAFE_INTEGER)) throw new GameError('INVALID_AMOUNT', 'Invalid order amount.', 400);
  return amount.toNumber();
}

export function reserveOrder(dataset: Dataset, portfolio: Portfolio, order: Order, snapshot: WorldEvent['snapshot']): Portfolio {
  if (portfolio.pendingOrderIds.length >= MAX_PENDING_ORDERS) throw new GameError('TOO_MANY_PENDING_ORDERS', 'At most 20 orders may be pending.');
  const next = structuredClone(portfolio);
  const holding = next.holdings[order.instrumentId] ?? { units: '0', reservedUnits: '0' };
  const priceILS = instrumentPriceILS(dataset, snapshot, order.instrumentId);
  if (order.side === 'buy') {
    if (order.amountAgorot > next.cashAgorot - next.reservedCashAgorot) throw new GameError('INSUFFICIENT_CASH', 'Not enough available cash.');
    // pending buys count toward the 20% limit, so two parallel buys cannot pass it together.
    const pending = next.pendingBuyAgorot[order.instrumentId] ?? 0;
    const exposure = decimal(holding.units).mul(priceILS).add(decimal(pending + order.amountAgorot).div(100));
    if (canonicalValueILS(exposure).gt(canonicalValueILS(portfolioValue(dataset, snapshot, next)).mul('0.2'))) throw new GameError('CONCENTRATION_LIMIT', 'This purchase would exceed the 20% instrument limit, including pending buys.');
    // keep the cash reserved until the order runs; total cash and value do not change yet.
    next.reservedCashAgorot += order.amountAgorot;
    next.pendingBuyAgorot[order.instrumentId] = pending + order.amountAgorot;
  } else {
    if (decimal(holding.reservedUnits).gt(0)) throw new GameError('SELL_ALREADY_PENDING', 'Only one sell order may be pending for this instrument.');
    if (decimal(holding.units).lte(0) || decimal(order.amountAgorot).div(100).gt(decimal(holding.units).mul(priceILS))) throw new GameError('INSUFFICIENT_UNITS', 'The sell amount exceeds the current holding value.');
    // reserve all current units; the exact number to sell is known only at the execution price.
    order.reservedUnits = holding.units;
    next.holdings[order.instrumentId] = { ...holding, reservedUnits: holding.units };
  }
  next.pendingOrderIds.push(order.id);
  next.nextSequence += 1;
  return next;
}

export function executeOrder(dataset: Dataset, portfolio: Portfolio, pending: Order, event: WorldEvent): { portfolio: Portfolio; order: Order } {
  if (pending.status !== 'pending') return { portfolio, order: pending };
  const next = structuredClone(portfolio);
  const order = structuredClone(pending);
  const holding = next.holdings[order.instrumentId] ?? { units: '0', reservedUnits: '0' };
  const priceILS = instrumentPriceILS(dataset, event.snapshot, order.instrumentId);
  const amountILS = decimal(order.amountAgorot).div(100);
  let rejection: Order['rejection'];
  let units = amountILS.div(priceILS).toDecimalPlaces(UNIT_DECIMALS, Decimal.ROUND_DOWN);

  // the reservation is released in the same update that marks the order executed or rejected.
  next.pendingOrderIds = next.pendingOrderIds.filter((id) => id !== order.id);
  if (order.side === 'buy') {
    next.reservedCashAgorot -= order.amountAgorot;
    const remaining = (next.pendingBuyAgorot[order.instrumentId] ?? 0) - order.amountAgorot;
    if (remaining > 0) next.pendingBuyAgorot[order.instrumentId] = remaining;
    else delete next.pendingBuyAgorot[order.instrumentId];
    // recheck cash and the 20% limit with the execution price, oldest order first.
    if (order.amountAgorot > next.cashAgorot - next.reservedCashAgorot) rejection = { code: 'INSUFFICIENT_CASH', message: 'The available cash is no longer sufficient.' };
    else if (canonicalValueILS(decimal(holding.units).mul(priceILS).add(amountILS)).gt(canonicalValueILS(portfolioValue(dataset, event.snapshot, next)).mul('0.2'))) rejection = { code: 'CONCENTRATION_LIMIT', message: 'The purchase would exceed 20% at the execution price.' };
    else if (units.isZero()) rejection = { code: 'AMOUNT_TOO_SMALL', message: 'The amount is too small for the supported unit precision.' };
    if (!rejection) {
      next.cashAgorot -= order.amountAgorot;
      next.holdings[order.instrumentId] = { units: decimal(holding.units).add(units).toFixed(UNIT_DECIMALS), reservedUnits: holding.reservedUnits };
    }
  } else {
    const exactUnits = amountILS.div(priceILS);
    next.holdings[order.instrumentId] = { ...holding, reservedUnits: '0' };
    if (exactUnits.gt(order.reservedUnits ?? 0) || exactUnits.gt(holding.units)) rejection = { code: 'INSUFFICIENT_UNITS', message: 'The holding no longer covers the requested ILS amount at execution.' };
    else if (units.isZero()) rejection = { code: 'AMOUNT_TOO_SMALL', message: 'The amount is too small for the supported unit precision.' };
    if (!rejection) {
      // round sold units up so rounding can never create extra value.
      units = exactUnits.toDecimalPlaces(UNIT_DECIMALS, Decimal.ROUND_UP);
      if (units.gt(order.reservedUnits ?? 0) || units.gt(holding.units)) rejection = { code: 'INSUFFICIENT_UNITS', message: 'The holding does not cover settlement rounding.' };
      else {
        next.cashAgorot += order.amountAgorot;
        next.holdings[order.instrumentId] = { units: decimal(holding.units).sub(units).toFixed(UNIT_DECIMALS), reservedUnits: '0' };
      }
    }
  }
  if (rejection) { order.status = 'rejected'; order.rejection = rejection; }
  else {
    const instrument = dataset.instruments.find((item) => item.id === order.instrumentId)!;
    order.status = 'executed';
    order.fill = { price: event.snapshot.prices[order.instrumentId]!, fx: instrument.currency === 'USD' ? event.snapshot.fx : '1', units: units.toFixed(UNIT_DECIMALS), executedAt: event.at };
  }
  assertPortfolioInvariants(next);
  return { portfolio: next, order };
}

export function assertPortfolioInvariants(portfolio: Portfolio): void {
  if (!Number.isSafeInteger(portfolio.cashAgorot) || portfolio.cashAgorot < 0 || portfolio.reservedCashAgorot < 0 || portfolio.reservedCashAgorot > portfolio.cashAgorot) throw new Error('invalid cash reservation');
  for (const holding of Object.values(portfolio.holdings)) {
    if (decimal(holding.units).isNegative() || decimal(holding.reservedUnits).isNegative() || decimal(holding.reservedUnits).gt(holding.units)) throw new Error('invalid unit reservation');
  }
}
