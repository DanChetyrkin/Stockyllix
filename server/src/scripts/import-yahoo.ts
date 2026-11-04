import 'dotenv/config';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { decimal } from '../domain/valuation.js';
import { instruments } from '../world/catalog.js';
import { buildHistoricalDataset } from '../world/historical.js';
import { validateFxRows, type FxRow } from '../world/index.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => DateTime.fromISO(value).isValid);
const price = z.string().regex(/^\d+(?:\.\d+)?$/).refine(value => decimal(value).gt(0));
const reportSchema = z.object({
  library: z.literal('yfinance'), libraryVersion: z.string().min(1), autoAdjust: z.literal(false),
  backAdjust: z.literal(false), repair: z.literal(false), startInclusive: date, endExclusive: date,
  notAttempted: z.array(z.string()).length(0),
  results: z.array(z.object({
    symbol: z.string(), market: z.enum(['TA', 'US']), status: z.literal('ok'),
    providerCurrency: z.enum(['ILA', 'ILS', 'USD']), normalizedCurrency: z.enum(['ILS', 'USD']),
    priceDivisor: z.enum(['1', '100']), exchangeTimezone: z.string(),
    missingComparedWithMarketPeers: z.array(date).length(0), issues: z.array(z.string()).length(0),
    bars: z.array(z.object({ date, open: price, close: price, providerOpen: price, providerClose: price })).min(1).max(1000),
    corporateActions: z.array(z.object({ date, type: z.string(), providerValue: z.string().regex(/^-?\d+(?:\.\d+)?$/) })),
  })).length(20),
});
const calendarSchema = z.object({
  verified: z.literal(true), reviewedAt: z.iso.datetime({ offset: true }),
  sourceUrls: z.array(z.url().refine(url => new URL(url).protocol === 'https:')).min(1),
  closedDates: z.object({ TA: z.array(date), US: z.array(date) }).strict(),
}).strict();

// staging a private candidate never changes the active world or grants data rights.
export function prepareYahooDataset(reportValue: unknown, fxValue: unknown, calendarValue: unknown, from = '2026-10-19', to = '2026-11-02', now = new Date()) {
  const report = reportSchema.parse(reportValue);
  const calendar = calendarSchema.parse(calendarValue);
  if (!fxValue || typeof fxValue !== 'object' || !('source' in fxValue) || fxValue.source !== 'boi' || !('rows' in fxValue)) throw new Error('Provide the separately imported Bank of Israel FX file');
  const fx = validateFxRows(fxValue.rows as FxRow[]);
  if (fx.some(row => row.source !== 'boi')) throw new Error('FX observations must all identify Bank of Israel');
  if (!date.safeParse(from).success || !date.safeParse(to).success || from > to || report.startInclusive >= from || report.endExclusive <= to) throw new Error('Yahoo history must include a prior baseline and the complete execution buffer');
  if (Date.parse(calendar.reviewedAt) > now.getTime()) throw new Error('Calendar review timestamp cannot be in the future');
  const symbols = new Set<string>();
  const bars = Object.fromEntries(report.results.map(item => {
    const instrument = instruments.find(instrument => instrument.id === item.symbol);
    if (!instrument || symbols.has(item.symbol) || instrument.market !== item.market || item.normalizedCurrency !== instrument.currency) throw new Error('Yahoo report contains a wrong or duplicate catalog listing');
    symbols.add(item.symbol);
    const expectedDivisor = item.providerCurrency === 'ILA' ? '100' : '1';
    if (item.priceDivisor !== expectedDivisor || (item.market === 'TA'
      ? !['ILA', 'ILS'].includes(item.providerCurrency) || !['Asia/Jerusalem', 'Asia/Tel_Aviv'].includes(item.exchangeTimezone)
      : item.providerCurrency !== 'USD' || item.exchangeTimezone !== 'America/New_York')) throw new Error('Yahoo report currency, units or timezone mismatch');
    const dates = new Set<string>();
    for (const bar of item.bars) {
      if (dates.has(bar.date) || bar.date < report.startInclusive || bar.date >= report.endExclusive
        || !decimal(bar.providerOpen).div(expectedDivisor).eq(bar.open) || !decimal(bar.providerClose).div(expectedDivisor).eq(bar.close)) throw new Error('Invalid, duplicated or incorrectly normalized Yahoo bar');
      dates.add(bar.date);
    }
    if (item.corporateActions.some(action => action.date >= from && action.date <= to && !decimal(action.providerValue).isZero())) throw new Error(`Unhandled corporate action for ${instrument.symbol}; choose a clean period before preparing this replay`);
    return [instrument.id, item.bars.map(({ date, open, close }) => ({ date, open, close }))];
  }));
  const sourceDescription = `Historical daily opening/closing prices from Yahoo Finance via yfinance ${report.libraryVersion}; Yahoo history may already be split-adjusted. Bank of Israel representative USD/ILS, available from the following Israel day. Verified market closures; assignment trading hours. No live prices, dividends or splits are simulated.`;
  return buildHistoricalDataset(instruments, bars, fx, from, to, now, { sourceDescription, closedDates: calendar.closedDates });
}

async function main() {
  const reportPath = process.env.YAHOO_REPORT_PATH || '../artifacts/yfinance-probe/all-with-buffer.json';
  const fxPath = process.env.BOI_FX_DATA_PATH || './data/boi-fx.json';
  const calendarPath = process.env.YAHOO_CALENDAR_PATH || './data/yahoo-calendar.json';
  const [report, fx, calendar] = await Promise.all([reportPath, fxPath, calendarPath].map(async path => JSON.parse(await readFile(resolve(path), 'utf8')) as unknown));
  const dataset = prepareYahooDataset(report, fx, calendar, process.env.YAHOO_FROM_DATE, process.env.YAHOO_TO_DATE);
  const output = resolve(process.env.YAHOO_OUTPUT_PATH || './data/yahoo-world.json');
  const normalized = (path: string) => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);
  if ([process.env.DATASET_PATH, process.env.HISTORICAL_DATASET_PATH].some(path => path && normalized(path) === normalized(output))) throw new Error('Choose a staging file separate from the configured active or available datasets');
  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(dataset)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, output);
  process.stdout.write(`Prepared private historical candidate ${dataset.id} through ${dataset.endsAt}. No world or deployment was changed. Confirm source rights before enabling it on a public server.\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`Yahoo replay preparation stopped: ${error instanceof Error ? error.message : 'unknown error'}\n`);
    process.exitCode = 1;
  });
}
