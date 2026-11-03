import 'dotenv/config';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchEcbRows } from '../world/ecb.js';

async function main(): Promise<void> {
  const result = await fetchEcbRows();
  const output = resolve(process.env.FX_DATA_PATH ?? fileURLToPath(new URL('../../data/fx.json', import.meta.url)));
  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(result, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, output);
  process.stdout.write(`Imported ${result.rows.length} real ECB USD/ILS observations into ${output}\n`);
  process.stdout.write(`${result.attribution}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`ECB import failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
    process.exitCode = 1;
  });
}
