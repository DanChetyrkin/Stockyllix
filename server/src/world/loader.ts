import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Dataset } from '../domain/model.js';
import { createDataset, validateDataset, validateFxRows, type FxRow } from './index.js';

export async function readPrivateDataset(path: string): Promise<Dataset> {
  const raw: unknown = JSON.parse(await readFile(resolve(path), 'utf8'));
  return validateDataset(raw);
}

export async function loadDataset(): Promise<Dataset> {
  if (process.env.DATASET_PATH) return readPrivateDataset(process.env.DATASET_PATH);
  const seed = process.env.DATASET_SEED;
  if (!seed) throw new Error('Set DATASET_SEED or a private DATASET_PATH before starting the server');
  const fxPath = process.env.FX_DATA_PATH ?? fileURLToPath(new URL('../../data/fx.json', import.meta.url));
  let rows: FxRow[] | undefined;
  try {
    const raw: unknown = JSON.parse(await readFile(resolve(fxPath), 'utf8'));
    if (typeof raw !== 'object' || raw === null || !('source' in raw) || raw.source !== 'ecb' || !('rows' in raw)) {
      throw new Error('FX file must contain an ECB source and rows');
    }
    rows = validateFxRows(raw.rows as FxRow[]);
    if (rows.some((row) => row.source !== 'ecb')) throw new Error('ECB file contains a non-ECB observation');
  } catch (error) {
    if (process.env.ALLOW_SIMULATED_FX !== 'true') {
      throw new Error(`Real FX file could not be loaded. Run npm run import:ecb, or explicitly set ALLOW_SIMULATED_FX=true for a labelled simulation. ${error instanceof Error ? error.message : ''}`);
    }
    // fallback is explicit and createDataset labels it as simulated fx
  }
  return createDataset(seed, rows);
}
