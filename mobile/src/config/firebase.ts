import AsyncStorage from '@react-native-async-storage/async-storage';
import { connectAuthEmulator, getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { authEmulatorUrl, firebaseApp } from './firebase-config';

export { firebaseConfigured } from './firebase-config';

// native login survives app restarts with async storage.
function createAuth() {
  if (!firebaseApp) return null;
  try {
    return initializeAuth(firebaseApp, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch (error) {
    if ((error as { code?: string }).code === 'auth/already-initialized') return getAuth(firebaseApp);
    throw error;
  }
}

export const auth = createAuth();
if (auth && authEmulatorUrl && !auth.emulatorConfig) {
  connectAuthEmulator(auth, authEmulatorUrl, { disableWarnings: false });
}
