import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDataset } from '../src/world/index.js';
import { loadDatasetRegistry } from '../src/world/loader.js';

const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
});

async function historicalFile() {
  const directory = await mkdtemp(join(tmpdir(), 'stockyllix-loader-'));
  directories.push(directory);
  const historical = {
    ...createDataset('loader-history-fixture'),
    source: 'historical',
    sourceDescription: 'Test fixture, not provider data',
  };
  const path = join(directory, 'historical.json');
  await writeFile(path, JSON.stringify(historical));
  vi.stubEnv('HISTORICAL_DATASET_PATH', path);
  return { historical, path };
}

describe('dataset loading', () => {
  it('serves only the historical snapshot when its file is configured', async () => {
    const { historical } = await historicalFile();
    const registry = await loadDatasetRegistry();
    expect(registry.defaultId).toBe(historical.id);
    expect(registry.get(historical.id)).toEqual(historical);
    expect(registry.summaries()).toHaveLength(1);
  });

  it('refuses generated or incomplete files rather than silently substituting prices', async () => {
    const { historical, path } = await historicalFile();
    await writeFile(path, JSON.stringify(createDataset('not-historical')));
    await expect(loadDatasetRegistry()).rejects.toThrow(/must contain historical prices/);
    delete historical.initialSnapshot.prices.AAPL;
    await writeFile(path, JSON.stringify(historical));
    await expect(loadDatasetRegistry()).rejects.toThrow();
  });

  it('runs a seeded simulation locally, but never in production', async () => {
    vi.stubEnv('HISTORICAL_DATASET_PATH', '');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DATASET_SEED', 'loader-local-seed');
    const local = await loadDatasetRegistry();
    expect(local.get(local.defaultId)).toEqual(createDataset('loader-local-seed'));
    vi.stubEnv('NODE_ENV', 'production');
    await expect(loadDatasetRegistry()).rejects.toThrow(/Production needs HISTORICAL_DATASET_PATH/);
  });
});
