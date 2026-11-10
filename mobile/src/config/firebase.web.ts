import { getAuth } from 'firebase/auth';
import { firebaseApp } from './firebase-config';

export { firebaseConfigured } from './firebase-config';
export const auth = firebaseApp ? getAuth(firebaseApp) : null;
