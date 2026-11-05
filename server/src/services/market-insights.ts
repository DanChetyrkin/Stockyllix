import { readIdleWorld } from '../data/current-world.js';
import type { DocumentStore } from '../data/store.js';
import { GameError } from '../domain/errors.js';
import type { Dataset, Instrument } from '../domain/model.js';
import { previousSessionClose, priceChangePct } from '../world/price-change.js';
import { DatasetRegistry, datasetRegistry } from '../world/registry.js';

interface PricePoint {
  at: string;
  price: string;
  kind: 'baseline' | 'open' | 'close';
}
const MAX_POINTS = 120;

// the asset chart reads only prices the shared clock has already reached.
export class MarketInsightsService {
  private readonly datasets: DatasetRegistry;
  constructor(
    private readonly store: DocumentStore,
    dataset: Dataset | DatasetRegistry,
  ) {
    this.datasets = datasetRegistry(dataset);
  }

  private instrument(id: string, dataset: Dataset): Instrument {
    const instrument = dataset.instruments.find(item => item.id === id);
    if (!instrument) throw new GameError('UNKNOWN_INSTRUMENT', 'Choose an asset from the game catalogue.', 404);
    return instrument;
  }

  async history(instrumentId: string) {
    return this.store.transaction(async tx => {
      const world = await readIdleWorld(tx);
      const dataset = this.datasets.get(world.datasetId);
      const instrument = this.instrument(instrumentId, dataset);
      const points: PricePoint[] = [
        { at: dataset.startsAt, price: dataset.initialSnapshot.prices[instrumentId]!, kind: 'baseline' },
      ];
      for (const event of dataset.events) {
        if (Date.parse(event.at) > Date.parse(world.now)) break;
        if (event.market !== instrument.market || !['MARKET_OPEN', 'MARKET_CLOSE'].includes(event.kind)) continue;
        points.push({
          at: event.at,
          price: event.snapshot.prices[instrumentId]!,
          kind: event.kind === 'MARKET_OPEN' ? 'open' : 'close',
        });
      }
      const previousClose = previousSessionClose(dataset, instrument.market, world.now);
      const latestPrice = world.snapshot.prices[instrumentId]!;
      const dailyChangePct = priceChangePct(latestPrice, previousClose?.snapshot.prices[instrumentId]);
      // keep both ends while bounding the response for longer datasets.
      const bounded =
        points.length <= MAX_POINTS
          ? points
          : Array.from(
              { length: MAX_POINTS },
              (_, index) => points[Math.round((index * (points.length - 1)) / (MAX_POINTS - 1))]!,
            );
      return {
        worldId: world.id,
        revision: world.revision,
        instrumentId,
        currency: instrument.currency,
        dataMode: dataset.source,
        sourceDescription: dataset.sourceDescription,
        asOf: world.now,
        latestPrice,
        dailyChangePct,
        previousCloseAt: previousClose ? previousClose.at : null,
        points: bounded,
      };
    });
  }
}
