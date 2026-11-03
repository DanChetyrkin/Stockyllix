import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('127.0.0.1'),
  FIREBASE_PROJECT_ID: z.string().default('stockyllix'),
  ADMIN_UIDS: z.string().default(''),
  CORS_ORIGINS: z.string().default('http://localhost:8081,http://127.0.0.1:8081'),
  FIREBASE_SERVICE_ACCOUNT: z.string().optional(),
});

export function readConfig(environment: NodeJS.ProcessEnv = process.env) {
  const value = schema.parse(environment);
  if (value.NODE_ENV === 'production') {
    if (environment.FIRESTORE_EMULATOR_HOST || environment.FIREBASE_AUTH_EMULATOR_HOST) {
      throw new Error('emulator settings are forbidden in production');
    }
    if (!environment.CORS_ORIGINS || !environment.ADMIN_UIDS) {
      throw new Error('production requires CORS_ORIGINS and ADMIN_UIDS');
    }
  }
  return {
    ...value,
    adminUids: new Set(value.ADMIN_UIDS.split(',').map((item) => item.trim()).filter(Boolean)),
    corsOrigins: value.CORS_ORIGINS.split(',').map((item) => item.trim()).filter(Boolean),
  };
}
