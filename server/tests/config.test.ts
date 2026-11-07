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
  it('requires both emulators to prevent accidental cloud calls', () => {
    expect(() => readConfig({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' })).toThrow(/both/);
  });
  it('requires production admin and origins configuration', () => {
    expect(() => readConfig({ NODE_ENV: 'production' })).toThrow(/requires/);
    expect(() =>
      readConfig({ NODE_ENV: 'production', ADMIN_UIDS: 'admin', CORS_ORIGINS: 'http://example.test' }),
    ).toThrow(/https/);
  });

  it('keeps owner and optional reviewer accounts separate', () => {
    const config = readConfig({ ADMIN_UIDS: 'owner', REVIEWER_UIDS: ' reviewer-a, reviewer-b, ' });
    expect([...config.adminUids]).toEqual(['owner']);
    expect([...config.reviewerUids]).toEqual(['reviewer-a', 'reviewer-b']);
    expect(() => readConfig({ ADMIN_UIDS: 'owner', REVIEWER_UIDS: ' owner ' })).toThrow(/different accounts/);
    expect(() =>
      readConfig({ NODE_ENV: 'production', REVIEWER_UIDS: 'reviewer', CORS_ORIGINS: 'https://example.test' }),
    ).toThrow(/requires CORS_ORIGINS and ADMIN_UIDS/);
  });
});
