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
  WORLD_CLOCK_AUTOSTART: z.enum(['true', 'false']).default('true'),
  CURRENT_MARKET_ACCESS: z.enum(['disabled', 'admin', 'public']).default('admin'),
  YAHOO_AUTOMATED_ACCESS_AUTHORIZED: z.enum(['true', 'false']).default('false'),
  NEWS_ACCESS: z.enum(['disabled', 'admin', 'public']).default('admin'),
  ALPHA_VANTAGE_API_KEY: z.string().optional(),
});

export function readConfig(environment: NodeJS.ProcessEnv = process.env) {
  const value = schema.parse(environment);
  if (value.CURRENT_MARKET_ACCESS === 'public' && environment.CURRENT_MARKET_PUBLIC_USE_CONFIRMED !== 'true') {
    throw new Error('Public quote display requires confirmed source permissions');
  }
  if (value.NEWS_ACCESS === 'public' && environment.NEWS_PUBLIC_USE_CONFIRMED !== 'true') {
    throw new Error('Public news display requires confirmed source permissions');
  }
  if (Boolean(environment.FIRESTORE_EMULATOR_HOST) !== Boolean(environment.FIREBASE_AUTH_EMULATOR_HOST)) {
    throw new Error('configure both auth and firestore emulators, or neither');
  }
  if (value.NODE_ENV === 'production') {
    if (environment.FIRESTORE_EMULATOR_HOST || environment.FIREBASE_AUTH_EMULATOR_HOST) {
      throw new Error('emulator settings are forbidden in production');
    }
    if (!environment.CORS_ORIGINS?.trim() || !environment.ADMIN_UIDS?.split(',').some((uid) => uid.trim())) {
      throw new Error('production requires CORS_ORIGINS and ADMIN_UIDS');
    }
    if (!value.CORS_ORIGINS.split(',').every((origin) => origin.trim().startsWith('https://'))) {
      throw new Error('production cors origins must use https');
    }
  }
  return {
    ...value,
    adminUids: new Set(value.ADMIN_UIDS.split(',').map((item) => item.trim()).filter(Boolean)),
    corsOrigins: value.CORS_ORIGINS.split(',').map((item) => item.trim()).filter(Boolean),
  };
}
