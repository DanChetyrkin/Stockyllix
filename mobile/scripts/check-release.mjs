import { existsSync } from 'node:fs';

try {
  if (existsSync('.env.production.local')) process.loadEnvFile('.env.production.local');
  const required = [
    'EXPO_PUBLIC_FIREBASE_API_KEY',
    'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
    'EXPO_PUBLIC_FIREBASE_APP_ID',
    'EXPO_PUBLIC_API_URL',
  ];
  const missing = required.filter(key => !process.env[key]?.trim());
  if (missing.length) throw new Error(`Missing production settings: ${missing.join(', ')}`);
  if (process.env.EXPO_PUBLIC_USE_EMULATORS !== 'false')
    throw new Error('Set EXPO_PUBLIC_USE_EMULATORS=false for release');
  const api = new URL(process.env.EXPO_PUBLIC_API_URL);
  if (
    api.protocol !== 'https:' ||
    api.username ||
    api.password ||
    /localhost|\.local$|^127\.|^10\.|^192\.168\./i.test(api.hostname)
  )
    throw new Error('Release requires a public HTTPS API URL');
  if (process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID.startsWith('demo-'))
    throw new Error('Release cannot use an emulator project');
  const origin = process.env.RELEASE_WEB_ORIGIN || `https://${process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID}.web.app`;
  const response = await fetch(new URL('/health', api), {
    headers: { Origin: origin },
    signal: AbortSignal.timeout(75_000),
  });
  if (!response.ok || (await response.json()).status !== 'ok') throw new Error('The public API health check failed');
  if (response.headers.get('access-control-allow-origin') !== origin)
    throw new Error('The API does not allow the intended Hosting origin');
  process.stdout.write(
    'Public API and browser-origin checks passed. Complete the authenticated cloud smoke test before handing off the link.\n',
  );
} catch (cause) {
  process.stderr.write(`Release is not ready: ${cause instanceof Error ? cause.message : 'unknown error'}\n`);
  process.exitCode = 1;
}
