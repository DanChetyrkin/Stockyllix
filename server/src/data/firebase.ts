import { applicationDefault, cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import type { readConfig } from '../config.js';
import { FirestoreStore } from './firestore-store.js';

export function connectFirebase(config: ReturnType<typeof readConfig>) {
  // render provides the service account as a secret; otherwise google's default credentials apply.
  const credential = config.FIREBASE_SERVICE_ACCOUNT
    ? cert(JSON.parse(config.FIREBASE_SERVICE_ACCOUNT) as ServiceAccount)
    : applicationDefault();
  const app = getApps()[0] ?? initializeApp({ projectId: config.FIREBASE_PROJECT_ID, credential });
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
