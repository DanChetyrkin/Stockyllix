import 'dotenv/config';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DateTime } from 'luxon';
import { instruments } from '../world/catalog.js';
import { fetchBoiRows } from '../world/boi.js';
import { buildHistoricalDataset } from '../world/historical.js';
import { fetchDailyBars, type DailyBar } from '../world/twelve-data.js';

async function main() {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key?.trim()) throw new Error('Set TWELVE_DATA_API_KEY in the server environment. No stock request was sent.');
  if (process.env.MARKET_DATA_USE_CONFIRMED !== 'true') throw new Error('Confirm provider coverage and storage/display rights before setting MARKET_DATA_USE_CONFIRMED=true. A free key alone does not grant TASE or public-display access.');
  // use completed daily bars, not an unfinished close from today's market.
  let last = DateTime.now().setZone('America/New_York').startOf('day').minus({ days: 1 });
  while (last.weekday > 5) last = last.minus({ days: 1 });
  const to = process.env.MARKET_TO_DATE || last.toISODate()!;
  const from = process.env.MARKET_FROM_DATE || last.startOf('week').minus({ weeks: 4 }).toISODate()!;
  const baselineFrom = DateTime.fromISO(from).minus({ days: 7 }).toISODate();
  if (!baselineFrom) throw new Error('Invalid market start date');
  const bars: Record<string, DailyBar[]> = {};
  for (const [index, instrument] of instruments.entries()) {
    bars[instrument.id] = await fetchDailyBars(instrument, baselineFrom, to, key);
    process.stdout.write(`Loaded ${instrument.symbol}: ${bars[instrument.id]!.length} daily observations (${index + 1}/${instruments.length})\n`);
    // spacing keeps a single import below the provider's basic per-minute rate.
    if (index < instruments.length - 1) await new Promise(resolve => setTimeout(resolve, 8500));
  }
  const fx = await fetchBoiRows(baselineFrom, to);
  const dataset = buildHistoricalDataset(instruments, bars, fx.rows, from, to);
  const output = resolve(process.env.MARKET_OUTPUT_PATH || './data/market-world.json');
  const normalizePath = (path: string) => process.platform === 'win32' ? path.toLowerCase() : path;
  if (process.env.DATASET_PATH && normalizePath(output) === normalizePath(resolve(process.env.DATASET_PATH))) throw new Error('Choose a staging output separate from the active dataset. Active game data is never replaced by this importer.');
  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(dataset)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, output);
  process.stdout.write(`Prepared a verified-shape historical world through ${to}. Keep it private and activate only for a new game world.\n`);
}

main().catch((cause: unknown) => {
  process.stderr.write(`Market import stopped: ${cause instanceof Error ? cause.message : 'unknown error'}\n`);
  process.exitCode = 1;
});
