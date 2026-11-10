import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateDataset } from './index.js';
import { DatasetRegistry } from './registry.js';

// the shared league replays the private historical snapshot that render mounts as a secret file.
export async function loadDatasetRegistry(): Promise<DatasetRegistry> {
  const path = process.env.HISTORICAL_DATASET_PATH;
  if (!path) throw new Error('Set HISTORICAL_DATASET_PATH to the private historical snapshot');
  const dataset = validateDataset(JSON.parse(await readFile(resolve(path), 'utf8')));
  if (dataset.source !== 'historical') throw new Error('HISTORICAL_DATASET_PATH must contain historical prices');
  return new DatasetRegistry(dataset);
}
