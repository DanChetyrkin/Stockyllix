import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createDataset, validateDataset } from './index.js';
import { DatasetRegistry } from './registry.js';

// production replays the private historical snapshot; without it, a seeded simulation runs locally.
export async function loadDatasetRegistry(): Promise<DatasetRegistry> {
  const historicalPath = process.env.HISTORICAL_DATASET_PATH;
  if (historicalPath) {
    const dataset = validateDataset(JSON.parse(await readFile(resolve(historicalPath), 'utf8')));
    if (dataset.source !== 'historical') throw new Error('HISTORICAL_DATASET_PATH must contain historical prices');
    return new DatasetRegistry(dataset);
  }
  if (process.env.NODE_ENV === 'production') throw new Error('Production needs HISTORICAL_DATASET_PATH');
  const seed = process.env.DATASET_SEED;
  if (!seed) throw new Error('Set DATASET_SEED for a local simulated world, or HISTORICAL_DATASET_PATH');
  return new DatasetRegistry(createDataset(seed));
}
