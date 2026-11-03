import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { authEmulatorUrl, firebaseApp } from './firebase-config';

export { firebaseConfigured } from './firebase-config';
export const auth = firebaseApp ? getAuth(firebaseApp) : null;
if (auth && authEmulatorUrl && !auth.emulatorConfig) {
  connectAuthEmulator(auth, authEmulatorUrl, { disableWarnings: false });
}
