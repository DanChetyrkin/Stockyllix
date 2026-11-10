import { getApp, getApps, initializeApp } from 'firebase/app';
import { apiConfigured } from './api-config';

// public firebase settings identify the app; they are not server credentials.
const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '',
};

export const firebaseConfigured = Object.values(config).every(Boolean);
export const firebaseApp =
  firebaseConfigured && apiConfigured ? (getApps().length ? getApp() : initializeApp(config)) : null;
