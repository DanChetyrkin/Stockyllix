import { getApp, getApps, initializeApp } from 'firebase/app';

// public firebase settings identify the app; they are not server credentials.
const useEmulator = process.env.EXPO_PUBLIC_USE_EMULATORS === 'true';
const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || (useEmulator ? 'demo-key' : ''),
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || (useEmulator ? 'demo-stockyllix.firebaseapp.com' : ''),
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || (useEmulator ? 'demo-stockyllix' : ''),
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || (useEmulator ? 'demo-stockyllix-app' : ''),
};

export const firebaseConfigured = Object.values(config).every(Boolean);
export const firebaseApp = firebaseConfigured ? (getApps().length ? getApp() : initializeApp(config)) : null;
export const authEmulatorUrl = useEmulator ? (process.env.EXPO_PUBLIC_AUTH_EMULATOR_URL || 'http://127.0.0.1:9099') : null;
