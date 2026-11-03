import { DateTime } from 'luxon';
import { z } from 'zod';
import type { Instrument } from '../domain/model.js';
import { decimal } from '../domain/valuation.js';
import { readResponseText } from './http.js';

export interface DailyBar { date: string; open: string; close: string }
const price = z.string().regex(/^\d+(\.\d+)?$/).refine(value => decimal(value).gt(0));
const responseSchema = z.object({
  status: z.literal('ok'),
  meta: z.object({ symbol: z.string(), interval: z.literal('1day'), currency: z.string(), mic_code: z.string(), exchange_timezone: z.string() }),
  values: z.array(z.object({ datetime: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), open: price, close: price })).min(1).max(1000),
});

export function parseDailyBars(raw: unknown, instrument: Instrument): DailyBar[] {
  const result = responseSchema.safeParse(raw);
  if (!result.success) throw new Error(`Invalid daily price response for ${instrument.symbol}`);
  const { meta, values } = result.data;
  if (meta.symbol !== instrument.symbol || (instrument.market === 'TA'
    ? meta.mic_code !== 'XTAE' || !['ILS', 'ILA'].includes(meta.currency) || !['Asia/Jerusalem', 'Asia/Tel_Aviv'].includes(meta.exchange_timezone)
    : meta.currency !== 'USD' || meta.exchange_timezone !== 'America/New_York' || !['XNAS', 'XNYS', 'ARCX', 'BATS', 'IEXG', 'XASE'].includes(meta.mic_code))) {
    throw new Error(`The provider returned the wrong listing or currency for ${instrument.symbol}`);
  }
  const dates = new Set<string>();
  return values.map(value => {
    if (!DateTime.fromISO(value.datetime).isValid || dates.has(value.datetime)) throw new Error(`Invalid or duplicate price date for ${instrument.symbol}`);
    dates.add(value.datetime);
    // israeli agorot are normalized once, before they enter the game.
    const divisor = meta.currency === 'ILA' ? 100 : 1;
    return { date: value.datetime, open: decimal(value.open).div(divisor).toString(), close: decimal(value.close).div(divisor).toString() };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export async function fetchDailyBars(instrument: Instrument, from: string, to: string, apiKey: string, fetcher: typeof fetch = fetch): Promise<DailyBar[]> {
  if (!apiKey.trim()) throw new Error('TWELVE_DATA_API_KEY is required; no stock API request was sent');
  if (![from, to].every(value => /^\d{4}-\d{2}-\d{2}$/.test(value) && DateTime.fromISO(value).isValid) || from > to) throw new Error('Choose a valid price date range');
  const url = new URL('https://api.twelvedata.com/time_series');
  url.search = new URLSearchParams({ symbol: instrument.symbol, ...(instrument.market === 'TA' ? { mic_code: 'XTAE' } : {}),
    interval: '1day', start_date: from, end_date: to, outputsize: '1000', order: 'asc', adjust: 'none', apikey: apiKey }).toString();
  let response: Response;
  try { response = await fetcher(url, { signal: AbortSignal.timeout(20_000) }); }
  catch { throw new Error(`The stock provider could not be reached for ${instrument.symbol}`); }
  if (!response.ok) throw new Error(`Stock provider HTTP ${response.status} for ${instrument.symbol}`);
  let raw: unknown;
  try { raw = JSON.parse(await readResponseText(response, 1_000_000)); }
  catch { throw new Error(`Invalid stock provider response for ${instrument.symbol}`); }
  if (typeof raw === 'object' && raw && 'status' in raw && raw.status === 'error') {
    // provider errors can include request parameters; do not log them or the api key.
    throw new Error(`The stock provider rejected ${instrument.symbol}. Check symbol coverage, access rights and quota.`);
  }
  return parseDailyBars(raw, instrument).filter(bar => bar.date >= from && bar.date <= to);
}
