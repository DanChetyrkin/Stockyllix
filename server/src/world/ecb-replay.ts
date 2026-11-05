import { createHash } from 'node:crypto';
import { createDataset, validateFxRows, type FxRow } from './index.js';
import type { FxFile } from './ecb.js';

export const ECB_REPLAY_CACHE_PATH = 'referenceData/ecb-2026-10-02_2026-11-02-v1';
export const ECB_REPLAY_ROWS_SHA256 = 'dd8937b9ac7fd1a3f0da18d88525dcbf722897ec5acf93571403d9883114d9d3';

export interface EcbReplayCache {
  schemaVersion: 1;
  rowsSha256: string;
  file: FxFile;
}

export function canonicalFxHash(rows: FxRow[]) {
  return createHash('sha256')
    .update(JSON.stringify(rows.map(({ date, rate, availableAt, source }) => ({ date, rate, availableAt, source }))))
    .digest('hex');
}

export function validateEcbReplay(value: unknown): FxFile {
  if (!value || typeof value !== 'object') throw new Error('Invalid ECB replay file');
  const file = value as FxFile;
  if (
    file.source !== 'ecb' ||
    !Array.isArray(file.rows) ||
    typeof file.sourceUrl !== 'string' ||
    typeof file.attribution !== 'string' ||
    !file.attribution.trim() ||
    typeof file.availabilityPolicy !== 'string' ||
    !file.availabilityPolicy.trim() ||
    typeof file.importedAt !== 'string' ||
    !Number.isFinite(Date.parse(file.importedAt))
  )
    throw new Error('Invalid ECB replay metadata');
  const url = new URL(file.sourceUrl);
  const officialCsv =
    url.hostname === 'data-api.ecb.europa.eu' && url.pathname === '/service/data/EXR/D.USD+ILS.EUR.SP00.A';
  const officialXml =
    url.hostname === 'www.ecb.europa.eu' && url.pathname === '/stats/eurofxref/eurofxref-hist-90d.xml';
  if (url.protocol !== 'https:' || url.username || url.password || (!officialCsv && !officialXml))
    throw new Error('ECB replay source must be an official ECB endpoint');
  const rows = validateFxRows(
    file.rows.map(({ date, rate, availableAt, source }) => ({ date, rate, availableAt, source })),
  );
  if (rows.some(row => row.source !== 'ecb') || canonicalFxHash(rows) !== ECB_REPLAY_ROWS_SHA256)
    throw new Error('ECB replay observations differ from the immutable original rates');
  // validate the whole original world, including baseline FX and maximum rate age.
  createDataset('ecb-replay-coverage-validation', rows);
  return {
    source: 'ecb',
    sourceUrl: file.sourceUrl,
    attribution: file.attribution,
    importedAt: file.importedAt,
    availabilityPolicy: file.availabilityPolicy,
    rows,
  };
}

export function ecbReplayCache(file: unknown): EcbReplayCache {
  return { schemaVersion: 1, rowsSha256: ECB_REPLAY_ROWS_SHA256, file: validateEcbReplay(file) };
}

export function validateEcbReplayCache(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('Invalid private ECB cache');
  const cache = value as EcbReplayCache;
  if (cache.schemaVersion !== 1 || cache.rowsSha256 !== ECB_REPLAY_ROWS_SHA256)
    throw new Error('Private ECB cache version does not match the original rates');
  return validateEcbReplay(cache.file);
}
