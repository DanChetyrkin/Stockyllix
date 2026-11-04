import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareEcbReplay } from '../src/scripts/import-ecb.js';
import { fetchEcbRows, type FxFile } from '../src/world/ecb.js';
import type { PrivateFxCache } from '../src/world/ecb-cache.js';
import { createDataset } from '../src/world/index.js';

const fixture = vi.hoisted(() => ({
  source: 'ecb', attribution: 'Synthetic test fixture; not provider data',
  sourceUrl: 'https://data-api.ecb.europa.eu/service/data/EXR/D.USD+ILS.EUR.SP00.A',
  importedAt: '2026-11-04T00:00:00Z', availabilityPolicy: 'Next-day test policy',
  rows: [{ date: '2026-10-02', rate: '3.7000000000', availableAt: '2026-10-02T21:00:00Z', source: 'ecb' }],
}));

// bootstrap tests use synthetic rows; the immutable production validator is tested separately.
vi.mock('../src/world/ecb-replay.js', async importOriginal => {
  const original = await importOriginal<typeof import('../src/world/ecb-replay.js')>();
  const validate = (file: unknown) => {
    if (JSON.stringify(file) !== JSON.stringify(fixture)) throw new Error('Invalid test replay');
    return file as FxFile;
  };
  return { ...original, validateEcbReplay: validate,
    validateEcbReplayCache: (value: { file: unknown }) => validate(value.file),
    ecbReplayCache: (file: unknown) => ({ schemaVersion: 1, rowsSha256: 'synthetic-unit-fixture', file: validate(file) }) };
});

const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const path of directories.splice(0)) {
    const target = resolve(path);
    if (!target.startsWith(`${resolve(tmpdir())}${sep}stockyllix-ecb-build-`)) throw new Error('Unexpected test cleanup directory');
    await rm(target, { recursive: true, force: true });
  }
});

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'stockyllix-ecb-build-'));
  directories.push(directory);
  const output = join(directory, 'fx.json');
  const download = vi.fn(async () => structuredClone(fixture) as FxFile);
  const read = vi.fn(async (): Promise<unknown> => null);
  const create = vi.fn(async () => {});
  const cache: PrivateFxCache = { read, create };
  const log = vi.fn();
  const pause = vi.fn<(milliseconds: number) => Promise<void>>(async () => {});
  const options = { output, datasetPath: null, download, cache, log, pause };
  return { directory, output, download, read, create, cache, log, pause, options };
}

describe('immutable replay FX build preparation', () => {
  it('uses a validated existing file without any provider or private cache request', async () => {
    const { output, options, download, read, create } = await setup();
    const original = `${JSON.stringify(fixture, null, 2)}\n`;
    await writeFile(output, original);
    expect((await prepareEcbReplay(options)).source).toBe('file');
    expect(download).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(await readFile(output, 'utf8')).toBe(original);
  });

  it('restores a missing file from private cache without depending on ECB availability', async () => {
    const { output, options, read, download, create } = await setup();
    read.mockResolvedValue({ file: fixture });
    expect((await prepareEcbReplay(options)).source).toBe('private-cache');
    expect(JSON.parse(await readFile(output, 'utf8'))).toEqual(fixture);
    expect(download).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('keeps an invalid existing file unchanged and refuses to hide corruption with a cache or download', async () => {
    const { output, options, read, download } = await setup();
    await writeFile(output, '{broken');
    await expect(prepareEcbReplay(options)).rejects.toMatchObject({ code: 'FX_FILE_INVALID' });
    expect(await readFile(output, 'utf8')).toBe('{broken');
    expect(read).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it('refuses an invalid private cache without replacing it or creating a replay file', async () => {
    const { output, options, read, create, download } = await setup();
    read.mockResolvedValue({ file: { ...fixture, source: 'simulated' } });
    await expect(prepareEcbReplay(options)).rejects.toMatchObject({ code: 'PRIVATE_CACHE_INVALID' });
    await expect(readFile(output)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(create).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it('limits failed downloads to three attempts, sanitizes logs, and leaves data absent', async () => {
    const { output, options, download, read, create, pause, log } = await setup();
    read.mockRejectedValue(new Error('credential secret should never appear'));
    download.mockRejectedValue(new Error('upstream URL?token=secret'));
    await expect(prepareEcbReplay(options)).rejects.toMatchObject({ code: 'ECB_UNAVAILABLE' });
    expect(download.mock.calls).toHaveLength(3);
    expect(pause.mock.calls.map(call => call[0])).toEqual([500, 1000]);
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
    expect(create).not.toHaveBeenCalled();
    await expect(readFile(output)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('recovers on the third official attempt and persists the validated private cache once', async () => {
    const { output, options, download, create } = await setup();
    download.mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError')).mockRejectedValueOnce(new Error('ECB download failed: HTTP 503'));
    expect((await prepareEcbReplay(options)).source).toBe('official');
    expect(download).toHaveBeenCalledTimes(3);
    expect(create).toHaveBeenCalledOnce();
    expect(JSON.parse(await readFile(output, 'utf8'))).toEqual(fixture);
  });

  it('fails closed if official rates change, including explicit refresh of an existing file', async () => {
    const { output, options, download, create } = await setup();
    const original = JSON.stringify(fixture);
    await writeFile(output, original);
    download.mockResolvedValue({ ...fixture, rows: [{ ...fixture.rows[0], rate: '9.0000000000' }] } as FxFile);
    await expect(prepareEcbReplay({ ...options, refresh: true })).rejects.toMatchObject({ code: 'ECB_REPLAY_CHANGED' });
    expect(download).toHaveBeenCalledOnce();
    expect(await readFile(output, 'utf8')).toBe(original);
    expect(create).not.toHaveBeenCalled();
  });

  it('does not require standalone FX when a valid explicit default dataset already contains it', async () => {
    const { directory, options, download, read } = await setup();
    const datasetPath = join(directory, 'default-dataset.json');
    const dataset = createDataset('private-dataset-build-fixture');
    await writeFile(datasetPath, JSON.stringify(dataset));
    expect((await prepareEcbReplay({ ...options, datasetPath })).source).toBe('dataset');
    expect(download).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    await writeFile(datasetPath, '{broken');
    await expect(prepareEcbReplay({ ...options, datasetPath })).rejects.toMatchObject({ code: 'DEFAULT_DATASET_INVALID' });
  });

  it('rejects synthetic rates and unofficial source metadata using the production validator', async () => {
    const actual = await vi.importActual<typeof import('../src/world/ecb-replay.js')>('../src/world/ecb-replay.js');
    expect(() => actual.validateEcbReplay(fixture)).toThrow('immutable original');
    expect(() => actual.validateEcbReplay({ ...fixture, sourceUrl: 'https://example.com/fx' })).toThrow('official ECB');
    expect(() => actual.validateEcbReplayCache({ schemaVersion: 2, rowsSha256: actual.ECB_REPLAY_ROWS_SHA256, file: fixture })).toThrow('version');
  });
});

describe('bounded official ECB download', () => {
  it('uses the documented XML endpoint and checks normalized observations', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('<Envelope xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref"><Cube time="2026-10-02"><Cube currency="USD" rate="1.1"/><Cube currency="ILS" rate="4.07"/></Cube></Envelope>'));
    const file = await fetchEcbRows(undefined, undefined, { fetcher, source: 'xml', timeoutMs: 50 });
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml');
    expect(file.rows[0]?.rate).toBe('3.7000000000');
    expect(file.sourceUrl).toContain('ecb.europa.eu');
  });

  it('applies a deadline to a stalled request and refuses oversized responses', async () => {
    const timeoutFetcher: typeof fetch = async (_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true });
    });
    await expect(fetchEcbRows(undefined, undefined, { fetcher: timeoutFetcher, timeoutMs: 10 })).rejects.toMatchObject({ name: 'TimeoutError' });
    const stalledBodyFetcher: typeof fetch = async (_url, options) => new Response(new ReadableStream({
      start(controller) { options?.signal?.addEventListener('abort', () => controller.error(options.signal?.reason), { once: true }); },
    }));
    await expect(fetchEcbRows(undefined, undefined, { fetcher: stalledBodyFetcher, timeoutMs: 10 })).rejects.toMatchObject({ name: 'TimeoutError' });
    const oversizedFetcher: typeof fetch = async () => new Response('x'.repeat(1_000_001));
    await expect(fetchEcbRows(undefined, undefined, { fetcher: oversizedFetcher })).rejects.toThrow('too large');
  });
});
