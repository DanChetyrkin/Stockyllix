import { getAuth } from 'firebase-admin/auth';
import { readConfig } from '../config.js';
import { connectFirebase } from '../data/firebase.js';
import { GameService } from '../services/game-service.js';
import { loadDataset } from '../world/loader.js';

const config = readConfig();
if (config.NODE_ENV === 'production' || config.FIREBASE_PROJECT_ID !== 'demo-stockyllix'
  || !process.env.FIRESTORE_EMULATOR_HOST?.startsWith('127.0.0.1:')
  || !process.env.FIREBASE_AUTH_EMULATOR_HOST?.startsWith('127.0.0.1:')) {
  throw new Error('seed:local only works with both loopback emulators and project demo-stockyllix');
}
const { store } = connectFirebase(config);
const game = new GameService(store, await loadDataset());
const auth = getAuth();
for (const user of [
  { uid: 'demo-admin', email: 'admin@example.test', displayName: 'Demo Administrator' },
  { uid: 'demo-player', email: 'player@example.test', displayName: 'Demo Player' },
]) {
  try {
    await auth.getUser(user.uid);
  } catch (error) {
    if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'auth/user-not-found')) throw error;
    await auth.createUser({ ...user, password: 'stockyllix-local-demo' });
  }
  await game.initialize(user.uid, user.displayName);
}
process.stdout.write('Local emulator users are ready. These are not cloud accounts.\n');
