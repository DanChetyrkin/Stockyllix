import type { LeaderboardRow, Portfolio, Dataset, MarketSnapshot } from './model.js';
import { decimal, portfolioValue, weeklyReturn } from './valuation.js';

export function rankPortfolios(dataset: Dataset, snapshot: MarketSnapshot, portfolios: Portfolio[]): LeaderboardRow[] {
  const entries = portfolios.map((portfolio) => {
    const value = portfolioValue(dataset, snapshot, portfolio);
    return { portfolio, value, returns: weeklyReturn(value, portfolio.week), mdd: decimal(portfolio.week.mddRatio) };
  });
  const eligible = entries.filter((entry) => entry.portfolio.week.eligible);
  const percentile = (better: number) => eligible.length <= 1 ? decimal(100) : decimal(100).mul(eligible.length - 1 - better).div(eligible.length - 1);
  const rows = entries.map((entry): LeaderboardRow => {
    const returnPercentile = entry.portfolio.week.eligible ? percentile(eligible.filter((other) => other.returns.gt(entry.returns)).length) : decimal(0);
    const stabilityPercentile = entry.portfolio.week.eligible ? percentile(eligible.filter((other) => other.mdd.lt(entry.mdd)).length) : decimal(0);
    return {
      uid: entry.portfolio.uid, displayName: entry.portfolio.displayName, valueILS: entry.value.toFixed(2),
      weeklyReturnPct: entry.returns.toFixed(6), mddPct: entry.mdd.mul(100).toFixed(6),
      returnPercentile: returnPercentile.toFixed(6), stabilityPercentile: stabilityPercentile.toFixed(6),
      score: returnPercentile.mul('0.85').add(stabilityPercentile.mul('0.15')).toFixed(6),
      rank: 0, eligible: entry.portfolio.week.eligible,
    };
  });
  rows.sort((a, b) => Number(b.eligible) - Number(a.eligible) || decimal(b.score).cmp(a.score) || a.uid.localeCompare(b.uid));
  rows.forEach((row) => { row.rank = row.eligible ? 1 + rows.filter((other) => other.eligible && decimal(other.score).gt(row.score)).length : 0; });
  return rows;
}
