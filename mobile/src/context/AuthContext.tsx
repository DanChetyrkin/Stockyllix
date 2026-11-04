import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut, updateProfile, User } from 'firebase/auth';
import { auth, firebaseConfigured } from '@/config/firebase';
import { api, ApiError, errorMessage } from '@/api/client';
import { apiConfigurationError, apiConfigured } from '@/config/api-config';
import { firstValidationError, normalizeEmail, registrationErrors, signInErrors } from '@/auth/validation';

interface AuthValue {
  user: User | null;
  loading: boolean;
  initializing: boolean;
  initialized: boolean;
  error: string | null;
  configured: boolean;
  configurationError: string | null;
  signIn(email: string, password: string): Promise<void>;
  register(name: string, email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  retryInitialization(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(firebaseConfigured && apiConfigured);
  const [initializing, setInitializing] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingName = useRef('');
  const generation = useRef(0);
  const initialization = useRef<{ uid: string; generation: number; promise: Promise<void> } | null>(null);

  const initialize = useCallback((current: User) => {
    const currentGeneration = generation.current;
    if (initialization.current?.uid === current.uid && initialization.current.generation === currentGeneration) return initialization.current.promise;
    const promise = (async () => {
      setInitializing(true);
      setError(null);
      try {
        // the server creates the initial balance only when this uid has no portfolio.
        const name = pendingName.current || current.displayName || current.email?.split('@')[0] || 'Investor';
        await api('/me/initialize', { method: 'POST', body: { displayName: name.trim().length >= 2 ? name : 'Investor' } });
        if (generation.current === currentGeneration) setInitialized(true);
      } catch (cause) {
        if (generation.current === currentGeneration) setError(cause instanceof ApiError && ['WORLD_ADVANCING', 'CLOCK_SYNCING'].includes(cause.code) ? null : errorMessage(cause));
      } finally {
        if (generation.current === currentGeneration) setInitializing(false);
        if (initialization.current?.generation === currentGeneration && initialization.current.uid === current.uid) initialization.current = null;
      }
    })();
    initialization.current = { uid: current.uid, generation: currentGeneration, promise };
    return promise;
  }, []);

  const retryInitialization = useCallback(async () => { if (user) await initialize(user); }, [user, initialize]);

  useEffect(() => {
    if (!auth || !apiConfigured) return;
    return onAuthStateChanged(auth, current => {
      generation.current += 1;
      setUser(current);
      setInitialized(false);
      setError(null);
      setLoading(false);
      if (current) void initialize(current);
      else setInitializing(false);
    });
  }, [initialize]);

  return <AuthContext.Provider value={{
    user, loading, initializing, initialized, error, configured: firebaseConfigured && apiConfigured,
    configurationError: !firebaseConfigured ? 'Public Firebase settings are missing. Copy mobile/.env.example to .env.local, fill the app settings and HTTPS API URL, then restart Expo.' : apiConfigurationError,
    signIn: async (email, password) => {
      if (!auth || !apiConfigured) throw new Error('Configure Firebase authentication and a secure API URL first.');
      const validation = firstValidationError(signInErrors(email, password));
      if (validation) throw new Error(validation);
      pendingName.current = '';
      await signInWithEmailAndPassword(auth, normalizeEmail(email), password);
    },
    register: async (name, email, password) => {
      if (!auth || !apiConfigured) throw new Error('Configure Firebase authentication and a secure API URL first.');
      const validation = firstValidationError(registrationErrors(name, email, password));
      if (validation) throw new Error(validation);
      pendingName.current = name.trim();
      const result = await createUserWithEmailAndPassword(auth, normalizeEmail(email), password);
      await updateProfile(result.user, { displayName: name.trim() });
    },
    signOut: async () => { if (auth) await firebaseSignOut(auth); },
    retryInitialization,
  }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth requires AuthProvider');
  return value;
}
