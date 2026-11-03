import { Decimal } from 'decimal.js';
import { DateTime } from 'luxon';
import { validateFxRows, WORLD_ZONE, type FxRow } from './index.js';

export const ECB_SOURCE_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml';
export const ECB_ATTRIBUTION = 'Source: European Central Bank euro foreign exchange reference rates. USD/ILS is calculated as ILS per EUR divided by USD per EUR.';

export interface FxFile {
  source: 'ecb';
  attribution: string;
  sourceUrl: string;
  importedAt: string;
  availabilityPolicy: string;
  rows: FxRow[];
}

// parse only the documented small ecb cube format, never execute imported content
export function parseEcbXml(xml: string, from = '2026-10-02', to = '2026-11-02'): FxRow[] {
  if (xml.length > 1_000_000) throw new Error('ECB document exceeds the size limit');
  if (!xml.includes('www.ecb.int/vocabulary/2002-08-01/eurofxref')) throw new Error('Unexpected ECB XML document');
  if (!DateTime.fromISO(from).isValid || !DateTime.fromISO(to).isValid || from > to) throw new Error('Invalid ECB date range');
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
    if (!rates.USD || !rates.ILS || !new Decimal(rates.USD).isPositive() || !new Decimal(rates.ILS).isPositive()) {
      throw new Error(`ECB document lacks valid USD and ILS rates for ${date}`);
    }
    const availableAt = DateTime.fromISO(date, { zone: WORLD_ZONE }).plus({ days: 1 }).startOf('day')
      .toUTC().toISO({ suppressMilliseconds: true })!;
    rows.push({ date, rate: new Decimal(rates.ILS).div(rates.USD).toFixed(10), availableAt, source: 'ecb' });
  }
  const valid = validateFxRows(rows);
  if (!valid.some((row) => row.date === from)) throw new Error(`ECB document lacks the required baseline date ${from}`);
  return valid;
}

export async function fetchEcbRows(from = '2026-10-02', to = '2026-11-02'): Promise<FxFile> {
  const response = await fetch(ECB_SOURCE_URL, {
    signal: AbortSignal.timeout(20_000),
    headers: { accept: 'application/xml,text/xml', 'user-agent': 'Stockyllix educational demo data importer' },
  });
  if (!response.ok || !response.body) throw new Error(`ECB download failed: HTTP ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let xml = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 1_000_000) throw new Error('ECB response exceeds the size limit');
      xml += decoder.decode(chunk.value, { stream: true });
    }
    xml += decoder.decode();
  } finally {
    await reader.cancel();
  }
  return {
    source: 'ecb', attribution: ECB_ATTRIBUTION, sourceUrl: ECB_SOURCE_URL,
    importedAt: new Date().toISOString(),
    availabilityPolicy: 'Each reference rate becomes available at 00:00 Asia/Jerusalem on the following calendar day. This conservative replay policy avoids using a daily observation before its publication.',
    rows: parseEcbXml(xml, from, to),
  };
}
