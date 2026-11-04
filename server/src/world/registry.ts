import type { Dataset } from '../domain/model.js';
import { GameError } from '../domain/errors.js';

function freeze(value: object): void {
  Object.freeze(value);
  for (const child of Object.values(value)) if (child && typeof child === 'object' && !Object.isFrozen(child)) freeze(child);
}

// a world always keeps the exact prices with which it was created.
export class DatasetRegistry {
  readonly defaultId: string;
  private readonly datasets = new Map<string, Dataset>();

  constructor(defaultDataset: Dataset, additional: Dataset[] = []) {
    this.defaultId = defaultDataset.id;
    for (const source of [defaultDataset, ...additional]) this.register(source);
  }

  register(source: Dataset) {
    // loaders/builders validate input; this registry preserves the supplied version.
    const copy = structuredClone(source);
    const existing = this.datasets.get(copy.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(copy)) throw new Error('Different datasets cannot share an identifier');
    freeze(copy);
    this.datasets.set(copy.id, copy);
  }

  fork() { return new DatasetRegistry(this.get(this.defaultId), [...this.datasets.values()].filter(source => source.id !== this.defaultId)); }

  get(id: string): Dataset {
    const dataset = this.datasets.get(id);
    if (!dataset) throw new GameError('DATASET_MISMATCH', 'This world’s original price dataset is not available on this server.', 503);
    return dataset;
  }

  summaries() {
    return [...this.datasets.values()].map(({ id, source, sourceDescription, startsAt, endsAt }) => ({ id, source, sourceDescription, startsAt, endsAt }));
  }
}

export function datasetRegistry(input: Dataset | DatasetRegistry): DatasetRegistry {
  return input instanceof DatasetRegistry ? input : new DatasetRegistry(input);
}
