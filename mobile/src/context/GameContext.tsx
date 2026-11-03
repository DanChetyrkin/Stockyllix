import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '@/api/client';
import { World } from '@/api/types';
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
  const { user, initialized } = useAuth();
  const [world, setWorld] = useState<World | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const activeUser = useRef(user?.uid);
  activeUser.current = user?.uid;

  const refreshWorld = useCallback(async () => {
    if (!user || !initialized) return;
    const uid = user.uid;
    setRefreshing(true);
    try {
      const data = await api<{ world: World; isAdmin: boolean }>('/world');
      if (activeUser.current !== uid) return;
      setWorld(data.world);
      setIsAdmin(data.isAdmin);
      setError(null);
      setRefreshKey(key => key + 1);
    } catch (cause) {
      if (activeUser.current === uid) setError(errorMessage(cause));
    } finally {
      if (activeUser.current === uid) setRefreshing(false);
    }
  }, [user, initialized]);

  useEffect(() => {
    setWorld(null);
    setIsAdmin(false);
    setError(null);
    if (initialized) void refreshWorld();
  }, [initialized, refreshWorld]);

  // polling is limited to an active shared clock job.
  useEffect(() => {
    if (world?.status !== 'advancing') return;
    const timer = setInterval(() => { void refreshWorld(); }, 3500);
    return () => clearInterval(timer);
  }, [world?.status, refreshWorld]);

  return <GameContext.Provider value={{ world, isAdmin, error, refreshing, refreshWorld, refreshKey }}>{children}</GameContext.Provider>;
}

export function useGame() {
  const value = useContext(GameContext);
  if (!value) throw new Error('useGame requires GameProvider');
  return value;
}
