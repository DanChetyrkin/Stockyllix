import type { LeaderboardRow, Portfolio, Dataset, MarketSnapshot } from './model.js';
import { decimal, formatDecimal, portfolioValue, weeklyReturn } from './valuation.js';

export function rankPortfolios(dataset: Dataset, snapshot: MarketSnapshot, portfolios: Portfolio[]): LeaderboardRow[] {
  const entries = portfolios.map((portfolio) => {
    const value = portfolio.week.finalValueILS === undefined ? portfolioValue(dataset, snapshot, portfolio) : decimal(portfolio.week.finalValueILS);
    // round first, so tiny settlement differences cannot decide a rank.
    const returns = decimal(formatDecimal(weeklyReturn(value, portfolio.week), 12));
    const mddPct = decimal(formatDecimal(decimal(portfolio.week.mddRatio).mul(100), 12));
    return { portfolio, value, returns, mddPct };
  });
  const eligible = entries.filter((entry) => entry.portfolio.week.eligible);
  // percentile = 100 × (players - rank) / (players - 1); equal results share a rank.
  const percentile = (better: number) => eligible.length <= 1 ? decimal(100) : decimal(100).mul(eligible.length - 1 - better).div(eligible.length - 1);
  const percentiles = (field: 'returns' | 'mddPct', direction: number) => {
    const sorted = [...eligible].sort((a, b) => a[field].cmp(b[field]) * direction);
    const result = new Map<string, ReturnType<typeof decimal>>();
    let better = 0;
    sorted.forEach((entry, index) => {
      if (index && !entry[field].eq(sorted[index - 1]![field])) better = index;
      result.set(entry.portfolio.uid, percentile(better));
    });
    return result;
  };
  const returns = percentiles('returns', -1);
  const stability = percentiles('mddPct', 1);
  const rows = entries.map((entry): LeaderboardRow => {
    const returnPercentile = returns.get(entry.portfolio.uid) ?? decimal(0);
    const stabilityPercentile = stability.get(entry.portfolio.uid) ?? decimal(0);
    return {
      uid: entry.portfolio.uid, displayName: entry.portfolio.displayName, valueILS: entry.value.toFixed(2),
      weeklyReturnPct: formatDecimal(entry.returns, 6), mddPct: formatDecimal(entry.mddPct, 6),
      returnPercentile: returnPercentile.toFixed(6), stabilityPercentile: stabilityPercentile.toFixed(6),
      score: returnPercentile.mul('0.85').add(stabilityPercentile.mul('0.15')).toFixed(6),
      rank: 0, eligible: entry.portfolio.week.eligible,
    };
  });
  rows.sort((a, b) => Number(b.eligible) - Number(a.eligible) || decimal(b.score).cmp(a.score) || a.uid.localeCompare(b.uid));
  let rank = 1;
  rows.forEach((row, index) => {
    if (index && !decimal(row.score).eq(rows[index - 1]!.score)) rank = index + 1;
    row.rank = row.eligible ? rank : 0;
  });
  return rows;
}
