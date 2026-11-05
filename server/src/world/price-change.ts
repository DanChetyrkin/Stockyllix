import { DateTime } from 'luxon';
import type { Dataset, Market, WorldEvent } from '../domain/model.js';
import { decimal } from '../domain/valuation.js';

export function previousSessionClose(dataset: Dataset, market: Market, asOf: string): WorldEvent | null {
  const zone = market === 'TA' ? 'Asia/Jerusalem' : 'America/New_York';
  const cutoff = Date.parse(asOf);
  let quoteDate: string | null = null;
  // closed markets keep their latest trading day's move, even after midnight.
  for (let index = dataset.events.length - 1; index >= 0; index -= 1) {
    const event = dataset.events[index]!;
    if (
      Date.parse(event.at) > cutoff ||
      event.market !== market ||
      !['MARKET_OPEN', 'MARKET_CLOSE'].includes(event.kind)
    )
      continue;
    const date = DateTime.fromISO(event.at, { zone }).toISODate()!;
    quoteDate ??= date;
    if (event.kind === 'MARKET_CLOSE' && date < quoteDate) return event;
  }
  return null;
}

export function priceChangePct(price: string, previousPrice: string | undefined): string | null {
  return previousPrice ? decimal(price).div(previousPrice).sub(1).mul(100).toFixed(6) : null;
}
