import type { DocumentStore, Transaction } from '../data/store.js';
import { GameError } from '../domain/errors.js';
import type { Dataset, Instrument, World } from '../domain/model.js';
import { decimal } from '../domain/valuation.js';
import { previousSessionClose, priceChangePct } from '../world/price-change.js';

export type WatchDirection = 'at_or_below' | 'at_or_above';
export interface WatchInput { instrumentId: string; targetPrice: string; direction: WatchDirection }
interface WatchEntry extends WatchInput { updatedAt: string }
interface Watchlist { items: Record<string, WatchEntry> }
interface PricePoint { at: string; price: string; kind: 'baseline' | 'open' | 'close' }
const MAX_WATCHES = 20;
const MAX_POINTS = 120;

// these preferences never reserve money or create an order.
export class MarketInsightsService {
  constructor(private readonly store: DocumentStore, private readonly dataset: Dataset, private readonly now: () => Date = () => new Date()) {}

  private async world(tx: Transaction): Promise<World> {
    const pointer = await tx.get<{ worldId: string }>('system/current');
    const world = pointer && await tx.get<World>(`worlds/${pointer.worldId}`);
    if (!world) throw new GameError('WORLD_NOT_FOUND', 'The shared world is not available. Refresh and try again.', 503, true);
    if (world.datasetId !== this.dataset.id) throw new GameError('DATASET_MISMATCH', 'The server dataset does not match this world.', 503);
    if (world.status !== 'idle') throw new GameError('WORLD_ADVANCING', 'The shared world is advancing. Try again when it finishes.', 423, true);
    return world;
  }

  private instrument(id: string): Instrument {
    const instrument = this.dataset.instruments.find(item => item.id === id);
    if (!instrument) throw new GameError('UNKNOWN_INSTRUMENT', 'Choose an asset from the game catalogue.', 404);
    return instrument;
  }

  async history(instrumentId: string) {
    const instrument = this.instrument(instrumentId);
    return this.store.transaction(async tx => {
      const world = await this.world(tx);
      const points: PricePoint[] = [{ at: this.dataset.startsAt, price: this.dataset.initialSnapshot.prices[instrumentId]!, kind: 'baseline' }];
      for (const event of this.dataset.events) {
        if (Date.parse(event.at) > Date.parse(world.now)) break;
        if (event.market !== instrument.market || !['MARKET_OPEN', 'MARKET_CLOSE'].includes(event.kind)) continue;
        points.push({ at: event.at, price: event.snapshot.prices[instrumentId]!, kind: event.kind === 'MARKET_OPEN' ? 'open' : 'close' });
      }
      const previousClose = previousSessionClose(this.dataset, instrument.market, world.now);
      const latestPrice = world.snapshot.prices[instrumentId]!;
      const dailyChangePct = priceChangePct(latestPrice, previousClose?.snapshot.prices[instrumentId]);
      // keep both ends while bounding the response for longer datasets.
      const bounded = points.length <= MAX_POINTS ? points : Array.from({ length: MAX_POINTS }, (_, index) => points[Math.round(index * (points.length - 1) / (MAX_POINTS - 1))]!);
      return {
        worldId: world.id, revision: world.revision, instrumentId, currency: instrument.currency,
        dataMode: this.dataset.source, sourceDescription: this.dataset.sourceDescription,
        asOf: world.now, latestPrice, dailyChangePct, previousCloseAt: previousClose ? previousClose.at : null, points: bounded,
      };
    });
  }

  async getWatchlist(uid: string) {
    return this.store.transaction(async tx => {
      const world = await this.world(tx);
      const watchlist = await tx.get<Watchlist>(`users/${uid}/watchlist/current`);
      const items = Object.values(watchlist?.items ?? {}).flatMap(entry => {
        const instrument = this.dataset.instruments.find(item => item.id === entry.instrumentId);
        if (!instrument) return [];
        const currentPrice = world.snapshot.prices[instrument.id]!;
        const reached = entry.direction === 'at_or_below' ? decimal(currentPrice).lte(entry.targetPrice) : decimal(currentPrice).gte(entry.targetPrice);
        return [{ ...entry, symbol: instrument.symbol, name: instrument.name, currency: instrument.currency, currentPrice, reached }];
      }).sort((a, b) => a.symbol.localeCompare(b.symbol));
      return { worldId: world.id, revision: world.revision, asOf: world.now, items };
    });
  }

  async setWatch(uid: string, input: WatchInput) {
    this.instrument(input.instrumentId);
    if (typeof input.targetPrice !== 'string' || !/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(input.targetPrice) || decimal(input.targetPrice).lte(0)) {
      throw new GameError('INVALID_TARGET', 'Enter a positive target price with up to six decimal places.');
    }
    if (!['at_or_below', 'at_or_above'].includes(input.direction)) throw new GameError('INVALID_DIRECTION', 'Choose whether to watch above or below the target.');
    const entry: WatchEntry = { instrumentId: input.instrumentId, targetPrice: decimal(input.targetPrice).toString(), direction: input.direction, updatedAt: this.now().toISOString() };
    return this.store.transaction(async tx => {
      await this.world(tx);
      const path = `users/${uid}/watchlist/current`;
      const watchlist = await tx.get<Watchlist>(path) ?? { items: {} };
      if (!watchlist.items[input.instrumentId] && Object.keys(watchlist.items).length >= MAX_WATCHES) throw new GameError('WATCHLIST_FULL', 'You can watch up to 20 assets.');
      tx.set(path, { items: { ...watchlist.items, [input.instrumentId]: entry } });
      return entry;
    });
  }

  async removeWatch(uid: string, instrumentId: string) {
    this.instrument(instrumentId);
    return this.store.transaction(async tx => {
      await this.world(tx);
      const path = `users/${uid}/watchlist/current`;
      const watchlist = await tx.get<Watchlist>(path);
      if (watchlist?.items[instrumentId]) {
        const items = { ...watchlist.items };
        delete items[instrumentId];
        tx.set(path, { items });
      }
      return { removed: true };
    });
  }
}
