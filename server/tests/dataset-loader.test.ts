import { mkdtemp, rm, rmdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDataset } from '../src/world/index.js';
import { loadDatasetRegistry } from '../src/world/loader.js';

const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const path of directories.splice(0)) {
    await Promise.all(['original.json', 'historical.json'].map(file => rm(join(path, file), { force: true })));
    await rmdir(path);
  }
});

async function files() {
  const directory = await mkdtemp(join(tmpdir(), 'stockyllix-loader-'));
  directories.push(directory);
  const original = createDataset('loader-original-fixture');
  const historical = {
    ...createDataset('loader-history-fixture'),
    source: 'historical',
    sourceDescription: 'Test fixture, not provider data',
  };
  const originalPath = join(directory, 'original.json');
  const historicalPath = join(directory, 'historical.json');
  await Promise.all([
    writeFile(originalPath, JSON.stringify(original)),
    writeFile(historicalPath, JSON.stringify(historical)),
  ]);
  vi.stubEnv('DATASET_PATH', originalPath);
  vi.stubEnv('HISTORICAL_DATASET_PATH', historicalPath);
  vi.stubEnv('HISTORICAL_DATA_USE_CONFIRMED', '');
  return { original, historical, historicalPath };
}

describe('private replay file selection', () => {
  it('registers an existing historical snapshot without claiming provider permission or changing the original default', async () => {
    const { original, historical } = await files();
    const registry = await loadDatasetRegistry();
    expect(registry.defaultId).toBe(original.id);
    expect(registry.get(original.id)).toEqual(original);
    expect(registry.get(historical.id)).toEqual(historical);
    expect(registry.summaries()).toHaveLength(2);
  });

  it('refuses generated or incomplete candidates rather than silently substituting prices', async () => {
    const { original, historical, historicalPath } = await files();
    await writeFile(historicalPath, JSON.stringify(original));
    await expect(loadDatasetRegistry()).rejects.toThrow(/must contain historical prices/);
    delete historical.initialSnapshot.prices.AAPL;
    await writeFile(historicalPath, JSON.stringify(historical));
    await expect(loadDatasetRegistry()).rejects.toThrow();
  });
});
