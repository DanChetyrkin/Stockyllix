import { playerPath, readCurrentWorld, readIdleWorld } from '../data/current-world.js';
import type { DocumentStore } from '../data/store.js';
import { GameError } from '../domain/errors.js';
import type { Dataset, Order, Portfolio } from '../domain/model.js';
import { decimal, formatDecimal, instrumentPriceILS, portfolioValue } from '../domain/valuation.js';
import { snapshotAt } from '../world/index.js';
import { DatasetRegistry, datasetRegistry } from '../world/registry.js';

// weighted average cost is measured in ils, including the execution exchange rate.
export function calculateCosts(orders: Order[]) {
  const positions: Record<string, { units: string; costILS: string }> = {};
  let realized = decimal(0);
  const fills = orders.filter(order => order.status === 'executed' && order.fill)
    .sort((a, b) => Date.parse(a.fill!.executedAt) - Date.parse(b.fill!.executedAt) || a.sequence - b.sequence);
  for (const order of fills) {
    const position = positions[order.instrumentId] ?? { units: '0', costILS: '0' };
    const units = decimal(position.units);
    const fillUnits = decimal(order.fill!.units);
    const amount = decimal(order.amountAgorot).div(100);
    if (order.side === 'buy') {
      positions[order.instrumentId] = { units: units.add(fillUnits).toFixed(18), costILS: decimal(position.costILS).add(amount).toFixed(24) };
    } else {
      if (fillUnits.lte(0) || fillUnits.gt(units)) throw new GameError('INCOMPLETE_LEDGER', 'Performance cannot be calculated from this order history.', 503);
      const soldCost = decimal(position.costILS).mul(fillUnits).div(units);
      realized = realized.add(amount).sub(soldCost);
      positions[order.instrumentId] = { units: units.sub(fillUnits).toFixed(18), costILS: decimal(position.costILS).sub(soldCost).toFixed(24) };
    }
  }
  return { positions, realizedILS: realized };
}

export class PerformanceService {
  private readonly datasets: DatasetRegistry;
  constructor(private readonly store: DocumentStore, dataset: Dataset | DatasetRegistry) {
    this.datasets = datasetRegistry(dataset);
  }

  async get(uid: string) {
    const world = await readIdleWorld(this.store);
    const dataset = this.datasets.get(world.datasetId);
    const path = playerPath(world.id, uid);
    const portfolio = await this.store.get<Portfolio>(path);
    if (!portfolio) throw new GameError('PLAYER_NOT_INITIALIZED', 'Create your portfolio first.', 404);
    // this optional report is bounded; never present a partial ledger as a full result.
    const rows = await this.store.list<Order>(`${path}/orders`, { orderBy: 'sequence', direction: 'asc', limit: 1001 });
    // reject a moving snapshot before diagnosing differences as a broken ledger.
    await this.store.transaction(async tx => {
      const latest = await readCurrentWorld(tx);
      if (latest?.id !== world.id || latest.revision !== world.revision || latest.status !== 'idle') {
        throw new GameError('WORLD_CHANGED', 'The shared world changed. Refresh this report.', 409, true);
      }
    });
    if (rows.length > 1000) throw new GameError('REPORT_LIMIT', 'This demonstration report supports up to 1,000 orders.', 422);
    const costs = calculateCosts(rows.map(row => row.data));
    let unrealized = decimal(0);
    const holdings = Object.entries(portfolio.holdings).map(([instrumentId, holding]) => {
      const cost = costs.positions[instrumentId] ?? { units: '0', costILS: '0' };
      if (!decimal(cost.units).eq(holding.units)) throw new GameError('INCOMPLETE_LEDGER', 'Performance cannot be calculated from this order history.', 503);
      const value = decimal(holding.units).mul(instrumentPriceILS(dataset, world.snapshot, instrumentId));
      const gain = value.sub(cost.costILS);
      unrealized = unrealized.add(gain);
      return { instrumentId, costILS: formatDecimal(cost.costILS, 2), unrealizedILS: formatDecimal(gain, 2) };
    });
    const value = portfolioValue(dataset, world.snapshot, portfolio);
    const periodReturn = value.div(1_000_000).sub(1).mul(100);
    const start = snapshotAt(dataset, portfolio.joinedAt);
    const benchmark = dataset.instruments.some(instrument => instrument.id === 'SPY')
      ? instrumentPriceILS(dataset, world.snapshot, 'SPY').div(instrumentPriceILS(dataset, start, 'SPY')).sub(1).mul(100) : null;
    return {
      worldId: world.id, revision: world.revision, from: portfolio.joinedAt, asOf: world.now, dataMode: dataset.source,
      realizedILS: formatDecimal(costs.realizedILS, 2), unrealizedILS: formatDecimal(unrealized, 2), totalProfitILS: formatDecimal(value.sub(1_000_000), 2),
      periodReturnPct: formatDecimal(periodReturn, 4), benchmarkReturnPct: benchmark ? formatDecimal(benchmark, 4) : null, excessReturnPct: benchmark ? formatDecimal(periodReturn.sub(benchmark), 4) : null,
      holdings, method: 'weighted average cost in ILS; SPY buy-and-hold over the same world period, including USD/ILS; not annualized',
    };
  }
}
