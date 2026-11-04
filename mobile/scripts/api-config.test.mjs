import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

function configuration(apiUrl, emulators = 'false') {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e',
    "const config = await import('./src/config/api-config.ts'); process.stdout.write(JSON.stringify(config));"], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, EXPO_PUBLIC_API_URL: apiUrl, EXPO_PUBLIC_USE_EMULATORS: emulators },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('a missing production api cannot fall back to localhost', () => {
  const config = configuration('');
  assert.equal(config.apiConfigured, false);
  assert.equal(config.apiBaseUrl, '');
  assert.match(config.apiConfigurationError, /missing/i);
});

test('real authentication requires an explicit https api', () => {
  assert.equal(configuration('http://localhost:3000/api').apiConfigured, false);
  assert.equal(configuration('http://example.com/api').apiConfigured, false);
  const config = configuration('https://stockyllix.example/api/');
  assert.equal(config.apiConfigured, true);
  assert.equal(config.apiBaseUrl, 'https://stockyllix.example/api');
});

test('local http is limited to explicitly enabled emulators', () => {
  assert.equal(configuration('', 'true').apiBaseUrl, 'http://localhost:3000/api');
  assert.equal(configuration('http://127.0.0.1:3000/api', 'true').apiConfigured, true);
  assert.equal(configuration('http://192.168.1.10:3000/api', 'true').apiConfigured, true);
  assert.equal(configuration('http://example.com/api', 'true').apiConfigured, false);
});

test('api configuration rejects ambiguous or malformed urls', () => {
  for (const url of ['not-a-url', 'https://user:password@example.com/api', 'https://example.com/api?token=x', 'https://example.com/api#fragment']) {
    assert.equal(configuration(url).apiConfigured, false, url);
  }
});
