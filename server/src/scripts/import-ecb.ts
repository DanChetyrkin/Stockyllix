import 'dotenv/config';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchEcbRows, type FxFile } from '../world/ecb.js';
import { ecbReplayCache, validateEcbReplay, validateEcbReplayCache } from '../world/ecb-replay.js';
import { privateFxCache, type PrivateFxCache } from '../world/ecb-cache.js';
import { validateDataset } from '../world/index.js';

class FxBootstrapError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

function failureCode(error: unknown) {
  if (error instanceof FxBootstrapError) return error.code;
  if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) return 'TIMEOUT';
  const status = error instanceof Error && /HTTP (\d{3})$/.exec(error.message)?.[1];
  return status ? `HTTP_${status}` : 'UNAVAILABLE_OR_INVALID';
}

async function existingReplay(output: string) {
  let text: string;
  try { text = await readFile(output, 'utf8'); }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return undefined;
    throw new FxBootstrapError('FX_FILE_UNREADABLE', 'The existing FX file cannot be read. Its contents were not changed.');
  }
  try { return validateEcbReplay(JSON.parse(text)); }
  catch { throw new FxBootstrapError('FX_FILE_INVALID', 'The existing FX file does not match the original validated ECB replay. It was not overwritten. Restore its original contents before deploying.'); }
}

async function writeReplay(output: string, result: FxFile) {
  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(result, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, output);
  } finally { await rm(temporary, { force: true }); }
}

export async function prepareEcbReplay(options: {
  output?: string;
  datasetPath?: string | null;
  refresh?: boolean;
  cache?: PrivateFxCache;
  download?: (attempt: number) => Promise<FxFile>;
  pause?: (milliseconds: number) => Promise<void>;
  log?: (message: string) => void;
} = {}) {
  const log = options.log ?? (message => process.stdout.write(`${message}\n`));
  const datasetPath = options.datasetPath === undefined ? process.env.DATASET_PATH : options.datasetPath;
  if (datasetPath) {
    try { validateDataset(JSON.parse(await readFile(resolve(datasetPath), 'utf8'))); }
    catch { throw new FxBootstrapError('DEFAULT_DATASET_INVALID', 'The configured private default dataset is invalid. No FX or dataset file was changed.'); }
    log('Validated the configured private default dataset; no standalone FX download is required.');
    return { source: 'dataset' as const };
  }
  const output = resolve(options.output ?? process.env.FX_DATA_PATH ?? fileURLToPath(new URL('../../data/fx.json', import.meta.url)));
  const existing = await existingReplay(output);
  if (existing && !options.refresh) {
    log(`Validated ${existing.rows.length} original ECB observations from the existing FX file; no network request was made.`);
    return { source: 'file' as const, file: existing };
  }
  const cache = options.cache ?? privateFxCache();
  if (!options.refresh) {
    let cached: unknown;
    try { cached = await cache.read(); }
    catch { log('Private ECB cache unavailable within its deadline; trying bounded official downloads.'); }
    if (cached) {
      let file: FxFile;
      try { file = validateEcbReplayCache(cached); }
      catch { throw new FxBootstrapError('PRIVATE_CACHE_INVALID', 'The private ECB cache does not match the immutable replay. No file or cache document was changed.'); }
      await writeReplay(output, file);
      log(`Restored ${file.rows.length} original ECB observations from the private cache; no ECB download was required.`);
      return { source: 'private-cache' as const, file };
    }
  }
  const download = options.download ?? (attempt => fetchEcbRows(undefined, undefined, { source: attempt === 3 ? 'xml' : 'csv' }));
  const pause = options.pause ?? (milliseconds => new Promise<void>(done => setTimeout(done, milliseconds)));
  let code = 'UNAVAILABLE';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let file: FxFile;
    try {
      const fetched = await download(attempt);
      try { file = validateEcbReplay(fetched); }
      catch { throw new FxBootstrapError('ECB_REPLAY_CHANGED', 'The official observations differ from the immutable replay or lack coverage. Existing game data was not changed.'); }
    } catch (error) {
      if (error instanceof FxBootstrapError) throw error;
      code = failureCode(error);
      log(`ECB download attempt ${attempt}/3 failed (${code}).`);
      if (attempt < 3) await pause(attempt * 500);
      continue;
    }
    await writeReplay(output, file);
    try { await cache.create(ecbReplayCache(file)); }
    catch { log('The validated FX file is ready, but private cache persistence was unavailable.'); }
    log(`Prepared ${file.rows.length} original ECB observations from the official source.`);
    return { source: 'official' as const, file };
  }
  throw new FxBootstrapError('ECB_UNAVAILABLE', `No validated replay file or private cache was available, and three bounded official download attempts failed (${code}). Retry deployment when ECB access is restored or restore the original private ECB cache.`);
}

async function main(): Promise<void> {
  if (process.argv.slice(2).some(argument => argument !== '--refresh')) throw new FxBootstrapError('INVALID_ARGUMENT', 'Use --refresh only when explicitly checking the unchanged official replay observations.');
  await prepareEcbReplay({ refresh: process.argv.includes('--refresh') });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`ECB preparation failed (${failureCode(error)}): ${error instanceof FxBootstrapError ? error.message : 'The FX preparation could not finish. Existing data was not replaced.'}\n`);
    process.exitCode = 1;
  });
}
