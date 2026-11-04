import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';
import { api, ApiError, errorMessage } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { RequestCoordinator } from './request-state';

// current feeds are independent of the demo clock and its processing jobs.
export function useFeed<T>(path: string, enabled = true) {
  const { user } = useAuth();
  const scope = `${user?.uid || ''}/${path}`;
  const [requests] = useState(() => new RequestCoordinator());
  const [result, setResult] = useState<{ scope: string; data: T } | null>(null);
  const [state, setState] = useState<{ scope: string; loading: boolean; error: string | null }>({ scope: '', loading: false, error: null });
  const refresh = useCallback(async () => {
    if (!user || !enabled) return;
    await requests.run(scope, async (signal, isCurrent) => {
      if (!isCurrent()) return;
      setState({ scope, loading: true, error: null });
      try {
        const data = await api<T>(path, { signal });
        if (isCurrent()) setResult({ scope, data });
      } catch (cause) {
        if (isCurrent() && !(cause instanceof ApiError && cause.code === 'CANCELLED')) {
          setState({ scope, loading: false, error: errorMessage(cause) });
        }
      } finally {
        if (isCurrent()) setState(value => ({ ...value, loading: false }));
      }
    });
  }, [user, enabled, requests, scope, path]);

  useFocusEffect(useCallback(() => {
    void refresh();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void refresh();
    }, 120_000);
    return () => { clearInterval(timer); requests.cancel(); };
  }, [refresh, requests]));
  return {
    data: result?.scope === scope ? result.data : null,
    loading: state.scope === scope && state.loading,
    error: state.scope === scope ? state.error : null,
    refresh,
  };
}
