import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, errorMessage } from '@/api/client';
import { World } from '@/api/types';
import { RequestCoordinator } from '@/hooks/request-state';
import { useAuth } from './AuthContext';

interface GameValue {
  world: World | null;
  isAdmin: boolean;
  error: string | null;
  refreshing: boolean;
  refreshWorld(): Promise<void>;
  refreshKey: number;
}

const GameContext = createContext<GameValue | null>(null);

export function GameProvider({ children }: PropsWithChildren) {
  const { user, initialized, retryInitialization } = useAuth();
  const uid = user?.uid;
  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Investor';
  const [snapshot, setSnapshot] = useState<{ uid: string; world: World; isAdmin: boolean } | null>(null);
  const [request, setRequest] = useState<{ uid: string; loading: boolean; error: string | null } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [requests] = useState(() => new RequestCoordinator());
  const currentWorldId = useRef<string | null>(null);
  const initializedRef = useRef(initialized);
  const notifyResources = useRef(false);

  useEffect(() => { initializedRef.current = initialized; }, [initialized]);
  useEffect(() => {
    currentWorldId.current = null;
    notifyResources.current = false;
    return () => requests.cancel();
  }, [uid, requests]);

  const loadWorld = useCallback(async (notify: boolean) => {
    if (!uid) return;
    if (notify) notifyResources.current = true;
    return requests.run(uid, async (signal, isCurrent) => {
      if (!isCurrent()) return;
      setRequest({ uid, loading: true, error: null });
      try {
        let data = await api<{ world: World; isAdmin: boolean }>('/world', { signal });
        if (!isCurrent()) return;
        if (data.world.status === 'idle') {
          try {
            if (!initializedRef.current) {
              await retryInitialization();
              if (!isCurrent()) return;
              // initialization reports its own errors; read the clock again after a possible pause.
              data = await api('/world', { signal });
            }
            else if (currentWorldId.current !== data.world.id) await api('/me/initialize', { method: 'POST', body: { displayName: displayName.trim().length >= 2 ? displayName : 'Investor' }, signal });
          } catch (cause) {
            if (!(cause instanceof ApiError) || cause.code !== 'WORLD_ADVANCING') throw cause;
            data = await api('/world', { signal });
          }
        }
        if (!isCurrent()) return;
        if (data.world.status === 'idle') currentWorldId.current = data.world.id;
        setSnapshot({ uid, world: data.world, isAdmin: data.isAdmin });
        if (notifyResources.current) setRefreshKey(key => key + 1);
      } catch (cause) {
        if (isCurrent()) setRequest({ uid, loading: false, error: errorMessage(cause) });
      } finally {
        if (isCurrent()) {
          notifyResources.current = false;
          setRequest(current => current?.uid === uid ? { ...current, loading: false } : current);
        }
      }
    });
  }, [uid, displayName, requests, retryInitialization]);

  const refreshWorld = useCallback(() => loadWorld(true), [loadWorld]);
  const ownSnapshot = snapshot && snapshot.uid === uid ? snapshot : null;
  const world = ownSnapshot?.world ?? null;
  const isAdmin = ownSnapshot?.isAdmin ?? false;

  useEffect(() => {
    const timer = setTimeout(() => { void loadWorld(false); }, 0);
    return () => clearTimeout(timer);
  }, [loadWorld]);

  // background polls share one request and do not refresh screen resources.
  useEffect(() => {
    if (world?.status !== 'advancing') return;
    const timer = setInterval(() => { void loadWorld(false); }, 3500);
    return () => clearInterval(timer);
  }, [world?.status, loadWorld]);

  const currentRequest = request && request.uid === uid ? request : null;
  const error = currentRequest?.error ?? null;
  const refreshing = currentRequest?.loading ?? false;
  const value = useMemo(() => ({ world, isAdmin, error, refreshing, refreshWorld, refreshKey }), [world, isAdmin, error, refreshing, refreshWorld, refreshKey]);
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const value = useContext(GameContext);
  if (!value) throw new Error('useGame requires GameProvider');
  return value;
}
