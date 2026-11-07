import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('127.0.0.1'),
  FIREBASE_PROJECT_ID: z.string().default('stockyllix'),
  ADMIN_UIDS: z.string().default(''),
  REVIEWER_UIDS: z.string().default(''),
  CORS_ORIGINS: z.string().default('http://localhost:8081,http://127.0.0.1:8081'),
  FIREBASE_SERVICE_ACCOUNT: z.string().optional(),
  WORLD_CLOCK_AUTOSTART: z.enum(['true', 'false']).default('true'),
});

function uidSet(list: string) {
  return new Set(list.split(',').map(uid => uid.trim()).filter(Boolean));
}

export function readConfig(environment: NodeJS.ProcessEnv = process.env) {
  const value = schema.parse(environment);
  const adminUids = uidSet(value.ADMIN_UIDS);
  const reviewerUids = uidSet(value.REVIEWER_UIDS);
  if ([...reviewerUids].some(uid => adminUids.has(uid))) {
    throw new Error('ADMIN_UIDS and REVIEWER_UIDS must contain different accounts');
  }
  if (Boolean(environment.FIRESTORE_EMULATOR_HOST) !== Boolean(environment.FIREBASE_AUTH_EMULATOR_HOST)) {
    throw new Error('configure both auth and firestore emulators, or neither');
  }
  if (value.NODE_ENV === 'production') {
    if (environment.FIRESTORE_EMULATOR_HOST || environment.FIREBASE_AUTH_EMULATOR_HOST) {
      throw new Error('emulator settings are forbidden in production');
    }
    if (!environment.CORS_ORIGINS?.trim() || !adminUids.size) {
      throw new Error('production requires CORS_ORIGINS and ADMIN_UIDS');
    }
    if (!value.CORS_ORIGINS.split(',').every(origin => origin.trim().startsWith('https://'))) {
      throw new Error('production cors origins must use https');
    }
  }
  return {
    ...value,
    adminUids,
    reviewerUids,
    corsOrigins: value.CORS_ORIGINS.split(',')
      .map(item => item.trim())
      .filter(Boolean),
  };
}
