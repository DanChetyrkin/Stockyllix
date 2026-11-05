import { Decimal } from 'decimal.js';
import { DateTime } from 'luxon';
import { csvRows } from './ecb.js';
import { readResponseText } from './http.js';
import { validateFxRows, WORLD_ZONE, type FxRow } from './index.js';

export const BOI_LATEST_URL = 'https://www.boi.org.il/PublicApi/GetExchangeRate?key=USD';
export const BOI_HISTORY_URL =
  'https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/EXR/1.0/RER_USD_ILS';
export const BOI_ATTRIBUTION = 'Source: Bank of Israel, daily representative USD/ILS exchange rates (RER_USD_ILS).';

interface DownloadOptions {
  fetcher?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
}

export interface BoiLatestRate {
  source: 'boi';
  rate: string;
  observedAt: string;
  date: string;
  sourceUrl: string;
  kind: 'representative';
}

export interface BoiFxFile {
  source: 'boi';
  sourceUrl: string;
  attribution: string;
  importedAt: string;
  availabilityPolicy: string;
  rows: FxRow[];
}

function validDate(date: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) && DateTime.fromISO(date).isValid && DateTime.fromISO(date).toISODate() === date
  );
}

function positiveRate(value: unknown): string {
  if ((typeof value !== 'string' && typeof value !== 'number') || !/^\d+(?:\.\d+)?$/.test(String(value))) {
    throw new Error('Bank of Israel returned an invalid rate');
  }
  const rate = new Decimal(value);
  if (!rate.isFinite() || rate.lte(0)) throw new Error('Bank of Israel returned an invalid rate');
  return rate.toFixed(10);
}

async function download(url: string, accept: string, maximum: number, options: DownloadOptions) {
  const response = await (options.fetcher ?? fetch)(url, {
    signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    headers: { accept, 'user-agent': 'Stockyllix educational demo' },
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`Bank of Israel download failed: HTTP ${response.status}`);
  }
  return readResponseText(response, maximum);
}

export function parseBoiLatest(value: unknown, now = new Date()): BoiLatestRate {
  if (!value || typeof value !== 'object') throw new Error('Unexpected Bank of Israel quote');
  const data = value as Record<string, unknown>;
  if (data.key !== 'USD' || data.unit !== 1) throw new Error('Unexpected Bank of Israel currency or unit');
  const rawTimestamp = data.lastUpdate;
  if (
    typeof rawTimestamp !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(rawTimestamp)
  ) {
    throw new Error('Bank of Israel quote lacks a publication timestamp');
  }
  const observed = DateTime.fromISO(rawTimestamp, { setZone: true });
  if (!observed.isValid || observed.toMillis() > now.getTime())
    throw new Error('Bank of Israel quote has an invalid or future publication timestamp');
  return {
    source: 'boi',
    rate: positiveRate(data.currentExchangeRate),
    observedAt: observed.toUTC().toISO()!,
    date: observed.setZone(WORLD_ZONE).toISODate()!,
    sourceUrl: BOI_LATEST_URL,
    kind: 'representative',
  };
}

export async function fetchBoiLatest(options: DownloadOptions = {}): Promise<BoiLatestRate> {
  const json: unknown = JSON.parse(await download(BOI_LATEST_URL, 'application/json', 32_768, options));
  return parseBoiLatest(json, (options.now ?? (() => new Date()))());
}

export function parseBoiCsv(csv: string, from = '2026-10-02', to = '2026-11-02', now = new Date()): FxRow[] {
  if (csv.length > 1_000_000) throw new Error('Bank of Israel document exceeds the size limit');
  const today = DateTime.fromJSDate(now, { zone: WORLD_ZONE }).toISODate()!;
  if (!validDate(from) || !validDate(to) || from > to || to > today)
    throw new Error('Invalid or future Bank of Israel date range');
  const records = csvRows(csv.replace(/^\uFEFF/, ''));
  const header = records.shift();
  const metadata = {
    SERIES_CODE: 'RER_USD_ILS',
    FREQ: 'D',
    BASE_CURRENCY: 'USD',
    COUNTER_CURRENCY: 'ILS',
    UNIT_MEASURE: 'ILS',
    DATA_TYPE: 'OF00',
    UNIT_MULT: '0',
  };
  const required = [...Object.keys(metadata), 'TIME_PERIOD', 'OBS_VALUE'];
  if (!header || new Set(header).size !== header.length || required.some(column => !header.includes(column)))
    throw new Error('Unexpected Bank of Israel CSV columns');
  const rows: FxRow[] = [];
  for (const record of records) {
    if (record.length !== header.length) throw new Error('Malformed Bank of Israel CSV row');
    const field = (column: string) => record[header.indexOf(column)]?.trim() ?? '';
    if (Object.entries(metadata).some(([key, expected]) => field(key) !== expected))
      throw new Error('Unexpected Bank of Israel exchange rate series or unit');
    const date = field('TIME_PERIOD');
    if (!validDate(date) || date > today) throw new Error('Invalid or future Bank of Israel observation date');
    if (date < from || date > to) continue;
    const availableAt = DateTime.fromISO(date, { zone: WORLD_ZONE })
      .plus({ days: 1 })
      .startOf('day')
      .toUTC()
      .toISO({ suppressMilliseconds: true })!;
    rows.push({ date, rate: positiveRate(field('OBS_VALUE')), availableAt, source: 'boi' });
  }
  const valid = validateFxRows(rows);
  if (!valid.some(row => row.date === from))
    throw new Error(`Bank of Israel document lacks the required baseline date ${from}`);
  return valid;
}

export async function fetchBoiRows(
  from = '2026-10-02',
  to = '2026-11-02',
  options: DownloadOptions = {},
): Promise<BoiFxFile> {
  const now = (options.now ?? (() => new Date()))();
  const today = DateTime.fromJSDate(now, { zone: WORLD_ZONE }).toISODate()!;
  if (!validDate(from) || !validDate(to) || from > to || to > today)
    throw new Error('Invalid or future Bank of Israel date range');
  const url = new URL(BOI_HISTORY_URL);
  url.search = new URLSearchParams({ startperiod: from, endperiod: to, format: 'csv' }).toString();
  const csv = await download(url.toString(), 'text/csv', 1_000_000, options);
  return {
    source: 'boi',
    sourceUrl: url.toString(),
    attribution: BOI_ATTRIBUTION,
    importedAt: now.toISOString(),
    availabilityPolicy:
      'Daily representative rates become available at 00:00 Asia/Jerusalem on the following calendar day. This conservative replay policy avoids assuming a historical intraday publication time.',
    rows: parseBoiCsv(csv, from, to, now),
  };
}
