import { describe, expect, it } from 'vitest';
import { readConfig } from '../src/config.js';

describe('runtime safety', () => {
  it('never enables emulator authentication in production', () => {
    expect(() =>
      readConfig({
        NODE_ENV: 'production',
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
        FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      }),
    ).toThrow(/emulator/);
  });
  it('requires production admin and origins configuration', () => {
    expect(() => readConfig({ NODE_ENV: 'production' })).toThrow(/requires/);
    expect(() =>
      readConfig({ NODE_ENV: 'production', ADMIN_UIDS: 'admin', CORS_ORIGINS: 'http://example.test' }),
    ).toThrow(/https/);
  });
});
