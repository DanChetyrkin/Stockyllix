import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Dataset } from '../domain/model.js';
import { createDataset, validateDataset, validateFxRows, type FxRow } from './index.js';
import { DatasetRegistry } from './registry.js';

export async function readPrivateDataset(path: string): Promise<Dataset> {
  const raw: unknown = JSON.parse(await readFile(resolve(path), 'utf8'));
  return validateDataset(raw);
}

export async function loadDatasetRegistry(): Promise<DatasetRegistry> {
  const active = await loadDataset();
  const candidatePath = process.env.HISTORICAL_DATASET_PATH;
  if (!candidatePath) return new DatasetRegistry(active);
  // selecting an existing private file neither fetches data nor grants a source licence.
  const candidate = await readPrivateDataset(candidatePath);
  if (candidate.source !== 'historical') throw new Error('The optional replay dataset must contain historical prices');
  return new DatasetRegistry(active, [candidate]);
}

export async function loadDataset(): Promise<Dataset> {
  if (process.env.DATASET_PATH) return readPrivateDataset(process.env.DATASET_PATH);
  const seed = process.env.DATASET_SEED;
  if (!seed) throw new Error('Set DATASET_SEED or a private DATASET_PATH before starting the server');
  if (process.env.NODE_ENV === 'production' && (seed.length < 32 || seed.includes('replace-with'))) {
    throw new Error('Production requires a private random DATASET_SEED of at least 32 characters');
  }
  const fxPath = process.env.FX_DATA_PATH ?? fileURLToPath(new URL('../../data/fx.json', import.meta.url));
  let rows: FxRow[] | undefined;
  try {
    const raw: unknown = JSON.parse(await readFile(resolve(fxPath), 'utf8'));
    if (
      typeof raw !== 'object' ||
      raw === null ||
      !('source' in raw) ||
      !['ecb', 'boi'].includes(String(raw.source)) ||
      !('rows' in raw)
    ) {
      throw new Error('FX file must contain an official source and rows');
    }
    rows = validateFxRows(raw.rows as FxRow[]);
    if (rows.some(row => row.source !== raw.source))
      throw new Error('FX observations do not match their declared source');
  } catch (error) {
    if (process.env.ALLOW_SIMULATED_FX !== 'true') {
      throw new Error(
        `Real FX file could not be loaded. Run npm run import:ecb, or explicitly set ALLOW_SIMULATED_FX=true for a labelled simulation. ${error instanceof Error ? error.message : ''}`,
      );
    }
    // the fallback must be enabled explicitly, and createDataset labels it as simulated fx.
  }
  return createDataset(seed, rows);
}
