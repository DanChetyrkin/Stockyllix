import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { api, ApiError, errorMessage } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { useGame } from '@/context/GameContext';
import { RequestCoordinator, resourceView, type RequestState } from './request-state';

export function useApi<T>(path: string) {
  const { user, initialized, error: authError, retryInitialization } = useAuth();
  const { world, error: worldError, refreshWorld, refreshKey } = useGame();
  const [result, setResult] = useState<{ scope: string; data: T } | null>(null);
  const [request, setRequest] = useState<RequestState>({ scope: '', loading: false, error: null });
  const [requests] = useState(() => new RequestCoordinator());
  const recoveryAttempt = useRef<string | null>(null);
  const uid = user?.uid;
  const worldId = world?.id;
  const revision = world?.revision;
  const status = world?.status;
  const scope = `${uid || ''}/${worldId || ''}/${path}`;
  const ready = Boolean(initialized && uid && worldId && status === 'idle');
  const requestKey = `${scope}/${revision}/${refreshKey}`;

  const refresh = useCallback(async () => {
    if (!ready) return;
    return requests.run(requestKey, async (signal, isCurrent) => {
      if (!isCurrent()) return;
      setRequest({ scope, loading: true, error: null });
      try {
        const data = await api<T>(path, { signal });
        if (!isCurrent()) return;
        const envelope = data as { worldId?: string; revision?: number };
        if ((envelope.worldId !== undefined && envelope.worldId !== worldId) || (envelope.revision !== undefined && envelope.revision !== revision)) {
          throw new ApiError('WORLD_CHANGED', 'The shared world changed. Refresh to load its latest completed state.', 409);
        }
        recoveryAttempt.current = null;
        setResult({ scope, data });
      } catch (cause) {
        if (!isCurrent() || (cause instanceof ApiError && cause.code === 'CANCELLED')) return;
        if (cause instanceof ApiError && ['WORLD_ADVANCING', 'WORLD_CHANGED', 'PLAYER_NOT_INITIALIZED'].includes(cause.code)) {
          const recoveryKey = `${scope}/${revision}/${cause.code}`;
          if (recoveryAttempt.current !== recoveryKey) {
            recoveryAttempt.current = recoveryKey;
            if (cause.code === 'PLAYER_NOT_INITIALIZED') await retryInitialization();
            await refreshWorld();
            if (isCurrent()) setRequest({ scope, loading: false, error: errorMessage(cause) });
            return;
          }
        }
        setRequest({ scope, loading: false, error: errorMessage(cause) });
      } finally {
        if (isCurrent()) setRequest(current => ({ ...current, loading: false }));
      }
    });
  }, [ready, requests, requestKey, scope, path, worldId, revision, retryInitialization, refreshWorld]);

  // polling can replace the world object without invalidating this request.
  useFocusEffect(useCallback(() => {
    const timer = setTimeout(() => { void refresh(); }, 0);
    return () => { clearTimeout(timer); requests.cancel(); };
  }, [refresh, requests]));

  const pauseReason = status === 'advancing'
    ? 'The shared world is advancing. Data refresh resumes when processing finishes.'
    : !initialized ? 'Your portfolio is being prepared.' : 'Connecting to the shared world.';
  return { ...resourceView({ scope, result, request, ready, pauseReason, prerequisiteError: !initialized ? authError : !worldId ? worldError : null }), refresh };
}
