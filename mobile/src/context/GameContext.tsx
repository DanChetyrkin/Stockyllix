import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { api, ApiError, errorMessage } from '@/api/client';
import { setTestRealm } from '@/api/realm';
import { World } from '@/api/types';
import { RequestCoordinator } from '@/hooks/request-state';
import { startingPlayerName } from '@/utils/player-name';
import { useAuth } from './AuthContext';

interface GameValue {
  world: World | null;
  isAdmin: boolean;
  canUseTestRealm: boolean;
  error: string | null;
  refreshing: boolean;
  refreshWorld(): Promise<void>;
  refreshKey: number;
  testRealm: boolean;
  switchRealm(testing: boolean): Promise<void>;
}

interface WorldResponse {
  world: World;
  isAdmin: boolean;
  canUseTestRealm?: boolean;
  testRealm?: boolean;
}

const GameContext = createContext<GameValue | null>(null);

export function GameProvider({ children }: PropsWithChildren) {
  const { user, initialized, retryInitialization } = useAuth();
  const uid = user?.uid;
  const displayName = startingPlayerName(user?.displayName, user?.email);
  const [realm, setRealm] = useState<{ uid: string; testing: boolean } | null>(null);
  const testRealm = Boolean(realm && realm.uid === uid && realm.testing);
  const realmReady = !uid || realm?.uid === uid;
  const [snapshot, setSnapshot] = useState<(WorldResponse & { uid: string; testing: boolean }) | null>(null);
  const [request, setRequest] = useState<{ uid: string; loading: boolean; error: string | null } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [requests] = useState(() => new RequestCoordinator());
  const currentWorldId = useRef<string | null>(null);
  const initializedRef = useRef(initialized);
  const notifyResources = useRef(false);
  const scope = `${uid}/${testRealm ? 'test' : 'shared'}`;
  const activeScope = useRef(scope);

  useEffect(() => {
    activeScope.current = scope;
  }, [scope]);
  useEffect(() => {
    initializedRef.current = initialized;
  }, [initialized]);
  useEffect(() => {
    currentWorldId.current = null;
    notifyResources.current = false;
    setTestRealm(uid || null, false);
    let active = true;
    if (uid)
      void AsyncStorage.getItem(`stockyllix.realm.${uid}`)
        .then(saved => {
          if (!active) return;
          setTestRealm(uid, saved === 'test');
          setRealm({ uid, testing: saved === 'test' });
        })
        .catch(() => {
          if (active) setRealm({ uid, testing: false });
        });
    return () => {
      active = false;
      requests.cancel();
    };
  }, [uid, requests]);

  const loadWorld = useCallback(
    async (notify: boolean) => {
      if (!uid || !realmReady || activeScope.current !== scope) return;
      if (notify) notifyResources.current = true;
      return requests.run(scope, async (signal, isCurrent) => {
        if (!isCurrent()) return;
        setRequest({ uid, loading: true, error: null });
        try {
          let data = await api<WorldResponse>('/world', { signal });
          if (!isCurrent()) return;
          if (testRealm && data.testRealm !== true)
            throw new ApiError(
              'TEST_WORLD_UNAVAILABLE',
              'The server has not confirmed an isolated test world. Return to the shared world and finish the server update.',
              503,
            );
          if (data.world.status === 'idle') {
            try {
              if (!initializedRef.current) {
                await retryInitialization();
                if (!isCurrent()) return;
                // initialization reports its own errors; read the clock again after a possible pause.
                data = await api('/world', { signal });
              } else if (currentWorldId.current !== data.world.id)
                await api('/me/initialize', { method: 'POST', body: { displayName }, signal });
            } catch (cause) {
              if (!(cause instanceof ApiError) || !['WORLD_ADVANCING', 'CLOCK_SYNCING'].includes(cause.code))
                throw cause;
              data = await api('/world', { signal });
            }
          }
          if (!isCurrent()) return;
          if (data.world.status === 'idle') currentWorldId.current = data.world.id;
          setSnapshot({ ...data, uid, testing: testRealm });
          if (notifyResources.current) setRefreshKey(key => key + 1);
        } catch (cause) {
          if (isCurrent()) setRequest({ uid, loading: false, error: errorMessage(cause) });
        } finally {
          if (isCurrent()) {
            notifyResources.current = false;
            setRequest(current => (current?.uid === uid ? { ...current, loading: false } : current));
          }
        }
      });
    },
    [uid, realmReady, testRealm, scope, displayName, requests, retryInitialization],
  );

  const refreshWorld = useCallback(() => loadWorld(true), [loadWorld]);
  const ownSnapshot = snapshot && snapshot.uid === uid && snapshot.testing === testRealm ? snapshot : null;
  const world = ownSnapshot?.world ?? null;
  const isAdmin = ownSnapshot?.isAdmin ?? false;
  const canUseTestRealm = ownSnapshot?.canUseTestRealm ?? isAdmin;
  const switchRealm = useCallback(
    async (testing: boolean) => {
      if (!uid || (testing && !canUseTestRealm)) throw new Error('Test game access is required.');
      await AsyncStorage.setItem(`stockyllix.realm.${uid}`, testing ? 'test' : 'shared');
      requests.cancel();
      currentWorldId.current = null;
      activeScope.current = `${uid}/${testing ? 'test' : 'shared'}`;
      setTestRealm(uid, testing);
      setSnapshot(null);
      setRequest(null);
      setRealm({ uid, testing });
      setRefreshKey(key => key + 1);
    },
    [uid, canUseTestRealm, requests],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadWorld(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [loadWorld]);

  // polling asks the server to synchronize; the device never executes an order.
  useEffect(() => {
    if (!uid || !realmReady) return;
    const timer = setInterval(
      () => {
        if (AppState.currentState === 'active') void loadWorld(false);
      },
      world?.status === 'advancing' || world?.clock?.syncing ? 3000 : 15000,
    );
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void loadWorld(false);
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [uid, realmReady, world?.status, world?.clock?.syncing, loadWorld]);

  const currentRequest = request && request.uid === uid ? request : null;
  const error = currentRequest?.error ?? null;
  const refreshing = currentRequest?.loading ?? false;
  const value = useMemo(
    () => ({ world, isAdmin, canUseTestRealm, error, refreshing, refreshWorld, refreshKey, testRealm, switchRealm }),
    [world, isAdmin, canUseTestRealm, error, refreshing, refreshWorld, refreshKey, testRealm, switchRealm],
  );
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const value = useContext(GameContext);
  if (!value) throw new Error('useGame requires GameProvider');
  return value;
}
