import 'dotenv/config';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchBoiRows } from '../world/boi.js';

async function main(): Promise<void> {
  const result = await fetchBoiRows();
  // keep the active replay file unchanged unless its own configuration is changed deliberately.
  const output = resolve(
    process.env.BOI_FX_DATA_PATH ?? fileURLToPath(new URL('../../data/boi-fx.json', import.meta.url)),
  );
  const activeReplay = resolve(
    process.env.FX_DATA_PATH ?? fileURLToPath(new URL('../../data/fx.json', import.meta.url)),
  );
  if (process.platform === 'win32' ? output.toLowerCase() === activeReplay.toLowerCase() : output === activeReplay) {
    throw new Error('BOI_FX_DATA_PATH must differ from the active FX_DATA_PATH');
  }
  await mkdir(dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(result, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, output);
  process.stdout.write(
    `Imported ${result.rows.length} Bank of Israel USD/ILS observations into ${output}\n${result.attribution}\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`Bank of Israel import failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
    process.exitCode = 1;
  });
}
