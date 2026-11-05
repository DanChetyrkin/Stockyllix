import { Decimal } from 'decimal.js';
import { DateTime } from 'luxon';
import { validateFxRows, WORLD_ZONE, type FxRow } from './index.js';
import { readResponseText } from './http.js';

export const ECB_ATTRIBUTION =
  'Source: European Central Bank euro foreign exchange reference rates. USD/ILS is calculated as ILS per EUR divided by USD per EUR.';
export const ECB_XML_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml';

export interface FxFile {
  source: 'ecb';
  attribution: string;
  sourceUrl: string;
  importedAt: string;
  availabilityPolicy: string;
  rows: FxRow[];
}

function observation(date: string, usd: string, ils: string): FxRow {
  if (!/^\d+(\.\d+)?$/.test(usd) || !/^\d+(\.\d+)?$/.test(ils) || !new Decimal(usd).gt(0) || !new Decimal(ils).gt(0))
    throw new Error(`Invalid ECB rate for ${date}`);
  const availableAt = DateTime.fromISO(date, { zone: WORLD_ZONE })
    .plus({ days: 1 })
    .startOf('day')
    .toUTC()
    .toISO({ suppressMilliseconds: true });
  if (!availableAt) throw new Error(`Invalid ECB date: ${date}`);
  return { date, rate: new Decimal(ils).div(usd).toFixed(10), availableAt, source: 'ecb' };
}

// a small csv reader for the quoted fields in the official ecb file.
export function csvRows(csv: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < csv.length; index++) {
    const character = csv[index]!;
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') {
        value += '"';
        index++;
      } else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if (character === '\n' && !quoted) {
      row.push(value.replace(/\r$/, ''));
      if (row.some(item => item.trim())) result.push(row);
      row = [];
      value = '';
    } else value += character;
  }
  if (quoted) throw new Error('Unclosed quoted ECB CSV field');
  if (row.length || value) {
    row.push(value.replace(/\r$/, ''));
    result.push(row);
  }
  return result;
}

export function parseEcbCsv(csv: string, from = '2026-10-02', to = '2026-11-02'): FxRow[] {
  if (csv.length > 1_000_000) throw new Error('ECB document exceeds the size limit');
  const records = csvRows(csv.replace(/^\uFEFF/, ''));
  const header = records.shift();
  const required = ['FREQ', 'CURRENCY', 'CURRENCY_DENOM', 'EXR_TYPE', 'EXR_SUFFIX', 'TIME_PERIOD', 'OBS_VALUE'];
  if (!header || required.some(column => !header.includes(column))) throw new Error('Unexpected ECB CSV columns');
  if (!DateTime.fromISO(from).isValid || !DateTime.fromISO(to).isValid || from > to)
    throw new Error('Invalid ECB date range');
  const rates = new Map<string, { USD?: string; ILS?: string }>();
  for (const record of records) {
    const field = (column: string) => record[header.indexOf(column)] ?? '';
    const date = field('TIME_PERIOD');
    if (date < from || date > to) continue;
    const currency = field('CURRENCY');
    if (
      !['USD', 'ILS'].includes(currency) ||
      field('FREQ') !== 'D' ||
      field('CURRENCY_DENOM') !== 'EUR' ||
      field('EXR_TYPE') !== 'SP00' ||
      field('EXR_SUFFIX') !== 'A'
    )
      throw new Error('Unexpected ECB exchange rate series');
    const pair = rates.get(date) ?? {};
    const key = currency as 'USD' | 'ILS';
    if (pair[key] !== undefined) throw new Error(`Duplicate ECB ${currency} observation for ${date}`);
    pair[key] = field('OBS_VALUE');
    rates.set(date, pair);
  }
  const rows = [...rates].map(([date, pair]) => {
    if (!pair.USD || !pair.ILS) throw new Error(`ECB document lacks valid USD and ILS rates for ${date}`);
    return observation(date, pair.USD, pair.ILS);
  });
  const valid = validateFxRows(rows);
  if (!valid.some(row => row.date === from)) throw new Error(`ECB document lacks the required baseline date ${from}`);
  return valid;
}

// parse only the documented ecb xml format; imported content is never executed.
export function parseEcbXml(xml: string, from = '2026-10-02', to = '2026-11-02'): FxRow[] {
  if (xml.length > 1_000_000) throw new Error('ECB document exceeds the size limit');
  if (!xml.includes('www.ecb.int/vocabulary/2002-08-01/eurofxref')) throw new Error('Unexpected ECB XML document');
  if (!DateTime.fromISO(from).isValid || !DateTime.fromISO(to).isValid || from > to)
    throw new Error('Invalid ECB date range');
  const rows: FxRow[] = [];
  const dayPattern = /<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>([\s\S]*?)<\/Cube>/g;
  for (const day of xml.matchAll(dayPattern)) {
    const date = day[1]!;
    if (date < from || date > to) continue;
    const rates: Record<string, string> = {};
    for (const quote of day[2]!.matchAll(/<Cube\s+([^>]+?)\s*\/>/g)) {
      const currency = /\bcurrency=['"]([A-Z]{3})['"]/.exec(quote[1]!)?.[1];
      const rate = /\brate=['"]([\d.]+)['"]/.exec(quote[1]!)?.[1];
      if (currency && rate) rates[currency] = rate;
    }
    if (!rates.USD || !rates.ILS || !new Decimal(rates.USD).gt(0) || !new Decimal(rates.ILS).gt(0)) {
      throw new Error(`ECB document lacks valid USD and ILS rates for ${date}`);
    }
    rows.push(observation(date, rates.USD, rates.ILS));
  }
  const valid = validateFxRows(rows);
  if (!valid.some(row => row.date === from)) throw new Error(`ECB document lacks the required baseline date ${from}`);
  return valid;
}

export async function fetchEcbRows(
  from = '2026-10-02',
  to = '2026-11-02',
  options: { fetcher?: typeof fetch; timeoutMs?: number; source?: 'csv' | 'xml' } = {},
): Promise<FxFile> {
  const url = new URL('https://data-api.ecb.europa.eu/service/data/EXR/D.USD+ILS.EUR.SP00.A');
  url.search = new URLSearchParams({ startPeriod: from, endPeriod: to, format: 'csvdata' }).toString();
  const sourceUrl = options.source === 'xml' ? ECB_XML_URL : url.toString();
  const response = await (options.fetcher ?? fetch)(sourceUrl, {
    signal: AbortSignal.timeout(options.timeoutMs ?? 12_000),
    headers: {
      accept: options.source === 'xml' ? 'application/xml' : 'text/csv',
      'user-agent': 'Stockyllix educational demo data importer',
    },
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`ECB download failed: HTTP ${response.status}`);
  }
  const text = await readResponseText(response, 1_000_000);
  return {
    source: 'ecb',
    attribution: ECB_ATTRIBUTION,
    sourceUrl,
    importedAt: new Date().toISOString(),
    availabilityPolicy:
      'Each reference rate becomes available at 00:00 Asia/Jerusalem on the following calendar day. This conservative replay policy avoids using a daily observation before its publication.',
    rows: options.source === 'xml' ? parseEcbXml(text, from, to) : parseEcbCsv(text, from, to),
  };
}
