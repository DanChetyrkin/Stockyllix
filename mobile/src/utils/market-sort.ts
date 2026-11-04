import type { Instrument } from '@/api/types';

export type MarketSort = 'name' | 'dailyChange';
export type SortDirection = 'asc' | 'desc';
type SortableAsset = Pick<Instrument, 'id' | 'name' | 'symbol' | 'dailyChangePct'>;

function nameOrder(a: SortableAsset, b: SortableAsset) {
  return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })
    || a.symbol.localeCompare(b.symbol, 'en') || a.id.localeCompare(b.id, 'en');
}

export function dailyChangeValue(value: string | null | undefined): number | null {
  if (value == null || !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function sortMarketAssets<T extends SortableAsset>(assets: readonly T[], field: MarketSort, direction: SortDirection): T[] {
  const order = direction === 'asc' ? 1 : -1;
  return [...assets].sort((a, b) => {
    if (field === 'name') return nameOrder(a, b) * order;
    const left = dailyChangeValue(a.dailyChangePct);
    const right = dailyChangeValue(b.dailyChangePct);
    // unavailable changes stay last in either direction.
    if (left === null || right === null) return left === right ? nameOrder(a, b) : left === null ? 1 : -1;
    return (left - right) * order || nameOrder(a, b);
  });
}
