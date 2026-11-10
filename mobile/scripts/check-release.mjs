import { existsSync } from 'node:fs';

// the release uses the same public settings as expo go: .env.local copied from .env.example.
try {
  if (existsSync('.env.local')) process.loadEnvFile('.env.local');
  const required = [
    'EXPO_PUBLIC_FIREBASE_API_KEY',
    'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
    'EXPO_PUBLIC_FIREBASE_APP_ID',
    'EXPO_PUBLIC_API_URL',
  ];
  const missing = required.filter(key => !process.env[key]?.trim());
  if (missing.length) throw new Error(`Missing production settings: ${missing.join(', ')}`);
  const api = new URL(process.env.EXPO_PUBLIC_API_URL);
  if (api.protocol !== 'https:') throw new Error('Release requires an HTTPS API URL');
  // the api must be up and must allow the hosting origin, or the new site cannot reach it.
  const origin = `https://${process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID}.web.app`;
  const response = await fetch(new URL('/health', api), {
    headers: { Origin: origin },
    signal: AbortSignal.timeout(75_000),
  });
  if (!response.ok || (await response.json()).status !== 'ok') throw new Error('The public API health check failed');
  if (response.headers.get('access-control-allow-origin') !== origin)
    throw new Error('The API does not allow the intended Hosting origin');
  process.stdout.write('Public API and browser-origin checks passed.\n');
} catch (cause) {
  process.stderr.write(`Release is not ready: ${cause instanceof Error ? cause.message : 'unknown error'}\n`);
  process.exitCode = 1;
}
