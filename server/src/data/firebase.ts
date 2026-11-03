import { applicationDefault, cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import type { readConfig } from '../config.js';
import { FirestoreStore } from './firestore-store.js';

export function connectFirebase(config: ReturnType<typeof readConfig>) {
  let app: App | undefined = getApps()[0];
  if (!app) {
    const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
    if (emulator && !config.FIREBASE_PROJECT_ID.startsWith('demo-')) {
      throw new Error('local emulators require a demo- project id to avoid cloud access');
    }
    const credential = config.FIREBASE_SERVICE_ACCOUNT
      ? cert(JSON.parse(config.FIREBASE_SERVICE_ACCOUNT) as ServiceAccount)
      : emulator ? undefined : applicationDefault();
    app = initializeApp({ projectId: config.FIREBASE_PROJECT_ID, ...(credential ? { credential } : {}) });
  }
  const store = new FirestoreStore(getFirestore(app));
  const auth = getAuth(app);
  return {
    store,
    verifyToken: async (token: string) => {
      const decoded = await auth.verifyIdToken(token);
      return { uid: decoded.uid };
    },
  };
}
