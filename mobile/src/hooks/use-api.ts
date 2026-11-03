import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, errorMessage } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { useGame } from '@/context/GameContext';

export function useApi<T>(path: string) {
  const { user, initialized } = useAuth();
  const { world, refreshKey } = useGame();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestNumber = useRef(0);
  const worldId = world?.id;
  const advancing = world?.status === 'advancing';

  const refresh = useCallback(async () => {
    if (!initialized || !user || !worldId || advancing) { setLoading(false); return; }
    const request = ++requestNumber.current;
    setLoading(true);
    try {
      const result = await api<T>(path);
      if (requestNumber.current === request) { setData(result); setError(null); }
    } catch (cause) {
      if (requestNumber.current === request && !(cause instanceof ApiError && cause.code === 'WORLD_ADVANCING')) setError(errorMessage(cause));
    } finally {
      if (requestNumber.current === request) setLoading(false);
    }
  }, [path, initialized, user, worldId, advancing]);

  useEffect(() => {
    requestNumber.current += 1;
    setData(null);
  }, [user?.uid, worldId]);

  useEffect(() => {
    void refresh();
    return () => { requestNumber.current += 1; };
  }, [refresh, refreshKey]);

  return { data, loading, error, refresh };
}
