import 'firebase/auth';
import type { Persistence, ReactNativeAsyncStorage } from 'firebase/auth';

// firebase 13 exports this on native, but its shared type entry omits it.
declare module 'firebase/auth' {
  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}
