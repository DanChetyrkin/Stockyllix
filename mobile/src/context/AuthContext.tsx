import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut, updateProfile, User } from 'firebase/auth';
import { auth, firebaseConfigured } from '@/config/firebase';
import { api, errorMessage } from '@/api/client';

interface AuthValue {
  user: User | null;
  loading: boolean;
  initializing: boolean;
  initialized: boolean;
  error: string | null;
  configured: boolean;
  signIn(email: string, password: string): Promise<void>;
  register(name: string, email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  retryInitialization(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(firebaseConfigured);
  const [initializing, setInitializing] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingName = useRef('');
  const generation = useRef(0);

  const initialize = useCallback(async (current: User) => {
    const currentGeneration = generation.current;
    setInitializing(true);
    setError(null);
    try {
      // the server creates the initial balance only when this uid has no portfolio.
      await api('/me/initialize', { method: 'POST', body: { displayName: pendingName.current || current.displayName || current.email?.split('@')[0] || 'Investor' } });
      if (generation.current === currentGeneration) setInitialized(true);
    } catch (cause) {
      if (generation.current === currentGeneration) setError(errorMessage(cause));
    } finally {
      if (generation.current === currentGeneration) setInitializing(false);
    }
  }, []);

  useEffect(() => {
    if (!auth) return;
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
    user, loading, initializing, initialized, error, configured: firebaseConfigured,
    signIn: async (email, password) => {
      if (!auth) throw new Error('Firebase authentication is not configured.');
      pendingName.current = '';
      await signInWithEmailAndPassword(auth, email.trim(), password);
    },
    register: async (name, email, password) => {
      if (!auth) throw new Error('Firebase authentication is not configured.');
      pendingName.current = name.trim();
      const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(result.user, { displayName: name.trim() });
    },
    signOut: async () => { if (auth) await firebaseSignOut(auth); },
    retryInitialization: async () => { if (user) await initialize(user); },
  }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth requires AuthProvider');
  return value;
}
