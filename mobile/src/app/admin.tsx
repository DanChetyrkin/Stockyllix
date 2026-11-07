import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { api, ApiError, errorMessage } from '@/api/client';
import type { World } from '@/api/types';
import { AppShell } from '@/components/AppShell';
import { DateTimeFields } from '@/components/admin/DateTimeFields';
import {
  Badge,
  Button,
  Card,
  CardTitle,
  Copy,
  DataState,
  Empty,
  Field,
  Notice,
  PageTitle,
  useThemedStyles,
} from '@/components/ui/kit';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useGame } from '@/context/GameContext';
import { dateTime, number } from '@/utils/format';
import {
  clockActionLabels,
  israelDateTime,
  parseClockRequest,
  suggestedGameTime,
  validCalendarDate,
  validIsraelDateTime,
  type ClockAction,
  type ClockRequest,
  type IsraelDateTime,
} from '@/utils/admin-clock';
import { useApi } from '@/hooks/use-api';

interface ReplayChoice {
  id: string;
  source: 'simulated' | 'historical';
  sourceDescription: string;
  startsAt: string;
  endsAt: string;
}
interface EventTarget {
  at: string;
  kind: 'MARKET_OPEN' | 'MARKET_CLOSE';
  market: 'TA' | 'US';
}
interface ClockTargets {
  worldId: string;
  gameNow: string;
  nextMarketEvent: EventTarget | null;
}
interface ClockReceipt {
  accepted: boolean;
  processingStatus?: 'accepted' | 'syncing' | 'completed' | 'superseded';
  action?: ClockAction;
}
interface NewGameRequest {
  key: string;
  worldId: string;
  datasetId?: string;
  simulation?: { startDate: string };
}
type RequestState = 'checking' | 'not_accepted' | 'unknown';

export default function AdminScreen() {
  const { world, isAdmin, canUseTestRealm, testRealm } = useGame();
  if (world && canUseTestRealm && !isAdmin && !testRealm) return <ReviewerTestGame />;
  return <WorldControls />;
}

function ReviewerTestGame() {
  const { switchRealm } = useGame();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openTestGame() {
    setOpening(true);
    setError(null);
    try {
      await switchRealm(true);
    } catch (cause) {
      setError(errorMessage(cause));
      setOpening(false);
    }
  }

  return (
    <AppShell>
      <PageTitle title="World controls" subtitle="Review the game in your isolated test world." />
      <Card style={{ gap: 12 }}>
        <CardTitle>Shared league game</CardTitle>
        <Copy>Open your isolated test game to change the clock or start a new game.</Copy>
        {error && <Notice tone="error">{error}</Notice>}
        <Button disabled={opening} loading={opening} onPress={() => void openTestGame()}>
          Open isolated test game
        </Button>
      </Card>
    </AppShell>
  );
}

function WorldControls() {
  const { palette } = useTheme();
  const ui = useThemedStyles();
  const { world, isAdmin, refreshWorld, testRealm, switchRealm } = useGame();
  const { user, retryInitialization } = useAuth();
  const targets = useApi<ClockTargets>('/admin/clock/targets');
  const choices = useApi<{ datasets: ReplayChoice[]; simulationAllowed?: boolean }>('/admin/datasets');
  const [custom, setCustom] = useState<IsraelDateTime>({ date: '', time: '' });
  const [newGameMode, setNewGameMode] = useState<'historical' | 'simulation'>('historical');
  const [simulationDate, setSimulationDate] = useState('2027-03-01');
  const [confirmation, setConfirmation] = useState('');
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState<ClockRequest | null>(null);
  const [savedState, setSavedState] = useState<RequestState>('checking');
  const [newGameDraft, setNewGameDraft] = useState<NewGameRequest | null>(null);
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | null>(null);
  const [storageFailed, setStorageFailed] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [showNewGame, setShowNewGame] = useState(false);
  const [suggestTestWorld, setSuggestTestWorld] = useState(false);
  const keepProcessing = useRef(false);
  const mounted = useRef(true);
  const actionBusy = useRef(false);
  const storageKey = `stockyllix.clock.${user?.uid || 'signed-out'}.${testRealm ? 'test' : 'shared'}.${world?.id || 'connecting'}`;
  const currentScope = useRef(storageKey);
  const worldRef = useRef(world);
  currentScope.current = storageKey;
  worldRef.current = world;
  const localScopeReady = loadedStorageKey === storageKey;
  const ready = localScopeReady && !storageFailed && !!world;
  const clock = world?.clock;
  const finished = Boolean(world?.finished || clock?.finished);
  const syncing = world?.status === 'advancing' || clock?.syncing;
  const selectedDatasetId =
    datasetId || choices.data?.datasets.find(choice => choice.source === 'historical')?.id || world?.datasetId;
  const simulationAllowed = testRealm && choices.data?.simulationAllowed === true;
  const controlsBlocked = busy || !ready || !!saved || !!newGameDraft || world?.status !== 'idle' || finished || !clock;
  // while events are being processed the saved targets may be outdated, so none are shown.
  const targetData = !targets.paused && targets.data?.worldId === world?.id ? targets.data : null;
  const targetStatus = targets.paused
    ? 'Shown again when synchronization finishes.'
    : !targetData && targets.loading
      ? 'Checking scheduled events…'
      : null;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      keepProcessing.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    Promise.all([AsyncStorage.getItem(storageKey), AsyncStorage.getItem(`${storageKey}.reset`)])
      .then(async ([value, newGameValue]) => {
        if (!active) return;
        const request = parseClockRequest(value);
        const pendingGame = newGameValue ? (JSON.parse(newGameValue) as NewGameRequest) : null;
        if (
          pendingGame &&
          (!pendingGame.worldId ||
            !pendingGame.key ||
            (pendingGame.simulation && !validCalendarDate(pendingGame.simulation.startDate)))
        )
          throw new Error('Invalid new-game request.');
        setSaved(request);
        setSavedState(request ? 'checking' : 'not_accepted');
        setNewGameDraft(pendingGame);
        setStorageFailed(false);
        setLoadedStorageKey(storageKey);
        const current = worldRef.current;
        setCustom(
          current ? suggestedGameTime(current.clock?.targetNow || current.now, current.endsAt) : { date: '', time: '' },
        );
        setConfirmation('');
        setDatasetId(null);
        setNewGameMode('historical');
        setSimulationDate('2027-03-01');
        setError(null);
        setMessage(null);
        setAdvanced(false);
        setShowNewGame(!!pendingGame);
        setSuggestTestWorld(false);
        if (!request) return;
        try {
          // a restored retry is checked before it can change the clock again.
          const receipt = await api<ClockReceipt>(receiptPath(request));
          if (!active || currentScope.current !== storageKey) return;
          if (receipt.accepted) {
            await AsyncStorage.removeItem(storageKey);
            if (!active) return;
            setSaved(null);
            setMessage(receiptMessage(receipt));
            await refreshWorld();
          } else setSavedState('not_accepted');
        } catch {
          if (active && currentScope.current === storageKey) setSavedState('unknown');
        }
      })
      .catch(() => {
        if (!active) return;
        setSaved(null);
        setNewGameDraft(null);
        setStorageFailed(true);
        setLoadedStorageKey(storageKey);
        setError(
          'Local retry data could not be read. Open Advanced to check server status and clear this device’s unreadable record.',
        );
      });
    return () => {
      active = false;
      keepProcessing.current = false;
    };
  }, [storageKey, refreshWorld]);

  function isCurrent(scope: string) {
    return mounted.current && currentScope.current === scope;
  }

  async function inspectSaved() {
    if (!saved || actionBusy.current) return;
    const scope = storageKey;
    actionBusy.current = true;
    setBusy(true);
    setError(null);
    setSavedState('checking');
    try {
      const receipt = await api<ClockReceipt>(receiptPath(saved));
      if (!isCurrent(scope)) return;
      if (receipt.accepted) {
        await AsyncStorage.removeItem(scope);
        if (!isCurrent(scope)) return;
        setSaved(null);
        setMessage(receiptMessage(receipt));
        await refreshWorld();
      } else setSavedState('not_accepted');
    } catch (cause) {
      if (isCurrent(scope)) {
        setSavedState('unknown');
        setError(errorMessage(cause));
      }
    } finally {
      actionBusy.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function clearLocalRequest() {
    if (actionBusy.current || !localScopeReady) return;
    const scope = storageKey;
    actionBusy.current = true;
    setBusy(true);
    setError(null);
    try {
      await api('/world');
      await AsyncStorage.multiRemove([scope, `${scope}.reset`]);
      if (!isCurrent(scope)) return;
      setSaved(null);
      setNewGameDraft(null);
      setStorageFailed(false);
      setMessage(
        'Only this device’s retry records were cleared. Server jobs, accepted changes and orders remain saved.',
      );
      await refreshWorld();
    } catch (cause) {
      if (isCurrent(scope)) setError(errorMessage(cause));
    } finally {
      actionBusy.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function changeScope() {
    if (!isAdmin || actionBusy.current || saved || newGameDraft || !ready) return;
    actionBusy.current = true;
    setBusy(true);
    setError(null);
    try {
      await switchRealm(!testRealm);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      actionBusy.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function configure(action: ClockAction) {
    if (!world || !isAdmin || actionBusy.current || !ready) return;
    if (!saved && action === 'set' && !validIsraelDateTime(custom)) {
      setError('Choose a valid date and a 24-hour time in Israel.');
      return;
    }
    const request = saved || {
      action,
      ...(action === 'set' ? { targetIsrael: custom } : {}),
      key: randomUUID(),
      worldId: world.id,
    };
    const scope = storageKey;
    actionBusy.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await AsyncStorage.setItem(scope, JSON.stringify(request));
      if (!isCurrent(scope)) return;
      setSaved(request);
      if (request.worldId !== world.id)
        throw new Error('This saved request belongs to an older game. Check server status before clearing it.');
      const result = await api<{ world: World }>('/admin/clock/configure', {
        method: 'POST',
        requestKey: request.key,
        body: {
          worldId: request.worldId,
          action: request.action,
          ...(request.target ? { target: request.target } : {}),
          ...(request.targetIsrael ? { targetIsrael: request.targetIsrael } : {}),
        },
      });
      await AsyncStorage.removeItem(scope);
      if (!isCurrent(scope)) return;
      setSaved(null);
      setCustom(suggestedGameTime(result.world.clock?.targetNow || result.world.now, result.world.endsAt));
      await refreshWorld();
      if (result.world.job) await processJob(result.world.job.id, true, scope);
      else
        setMessage(
          request.action === 'pause'
            ? 'Game clock paused. Pending orders remain saved.'
            : ['set', 'next'].includes(request.action)
              ? 'Game time applied. All reached events were processed and the clock is paused.'
              : 'Game clock running at one game second per server second.',
        );
    } catch (cause) {
      if (!isCurrent(scope)) return;
      if (
        cause instanceof ApiError &&
        cause.status >= 400 &&
        cause.status < 500 &&
        ![
          'WORLD_ADVANCING',
          'WORLD_CHANGED',
          'JOB_BUSY',
          'LEASE_LOST',
          'CLOCK_SYNCING',
          'RATE_LIMITED',
          'IDEMPOTENCY_CONFLICT',
        ].includes(cause.code)
      ) {
        await AsyncStorage.removeItem(scope)
          .then(() => {
            if (isCurrent(scope)) setSaved(null);
          })
          .catch(() => undefined);
      } else {
        setSavedState('unknown');
        setAdvanced(true);
      }
      if (cause instanceof ApiError && cause.code === 'CLOCK_BACKWARD') {
        setSuggestTestWorld(true);
        if (testRealm) setShowNewGame(true);
      }
      setError(errorMessage(cause));
      await refreshWorld();
    } finally {
      actionBusy.current = false;
      keepProcessing.current = false;
      if (mounted.current) {
        setBusy(false);
        setProcessing(false);
      }
    }
  }

  async function processJob(jobId: string, auto: boolean, scope: string) {
    keepProcessing.current = auto;
    setProcessing(auto);
    for (let index = 0; index < 200; index += 1) {
      if (!isCurrent(scope) || (auto && !keepProcessing.current)) return;
      try {
        const result = await api<{ status: string; job: { id: string } | null }>(
          `/admin/clock/jobs/${encodeURIComponent(jobId)}/step`,
          { method: 'POST' },
        );
        await refreshWorld();
        if (!isCurrent(scope)) return;
        if (result.status !== 'advancing' || !result.job) {
          setMessage('Game time updated. Orders and account balances are synchronized.');
          return;
        }
      } catch (cause) {
        if (!(cause instanceof ApiError) || !['JOB_BUSY', 'LEASE_LOST', 'JOB_NOT_FOUND'].includes(cause.code))
          throw cause;
        await refreshWorld();
        if (cause.code === 'JOB_NOT_FOUND' || !auto) return;
      }
      if (!auto || !keepProcessing.current) return;
      if (index < 199) await new Promise(resolve => setTimeout(resolve, 1200));
    }
    setMessage('Processing is still running safely. Open Advanced to continue from its saved progress.');
  }

  async function step(auto: boolean) {
    if (!world?.job || !isAdmin || actionBusy.current) return;
    const scope = storageKey;
    actionBusy.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await processJob(world.job.id, auto, scope);
    } catch (cause) {
      if (isCurrent(scope)) {
        setError(errorMessage(cause));
        setAdvanced(true);
        await refreshWorld();
      }
    } finally {
      actionBusy.current = false;
      keepProcessing.current = false;
      if (mounted.current) {
        setBusy(false);
        setProcessing(false);
      }
    }
  }

  async function startNewGame() {
    if (!world || !isAdmin || (confirmation !== 'NEW GAME' && !newGameDraft) || actionBusy.current || saved || !ready)
      return;
    if (!newGameDraft && newGameMode === 'simulation' && (!simulationAllowed || !validCalendarDate(simulationDate))) {
      setError('Choose a valid starting date for the isolated simulated game.');
      return;
    }
    const scope = storageKey;
    const request = newGameDraft || {
      key: randomUUID(),
      worldId: world.id,
      ...(newGameMode === 'simulation'
        ? { simulation: { startDate: simulationDate } }
        : { datasetId: selectedDatasetId }),
    };
    actionBusy.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await AsyncStorage.setItem(`${scope}.reset`, JSON.stringify(request));
      if (!isCurrent(scope)) return;
      setNewGameDraft(request);
      await api('/admin/reset', {
        method: 'POST',
        body: {
          worldId: request.worldId,
          confirmation: 'RESET',
          ...(request.simulation ? { simulation: request.simulation } : { datasetId: request.datasetId }),
        },
        requestKey: request.key,
      });
      await AsyncStorage.multiRemove([`${scope}.reset`, scope]);
      if (!isCurrent(scope)) return;
      setNewGameDraft(null);
      setSaved(null);
      setConfirmation('');
      setShowNewGame(false);
      await retryInitialization();
      await refreshWorld();
    } catch (cause) {
      if (isCurrent(scope)) {
        setError(errorMessage(cause));
        setAdvanced(true);
      }
    } finally {
      actionBusy.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <AppShell>
      <PageTitle
        title="World controls"
        subtitle="Control the selected game clock. All dates and times below use Israel time."
        action={
          <Button compact variant="quiet" loading={busy} onPress={() => void refreshWorld()}>
            Refresh
          </Button>
        }
      />
      {!world ? (
        <Copy muted>Connecting to world controls…</Copy>
      ) : !isAdmin ? (
        <Empty
          title="Administrator access required"
          detail="Only a server-authorized administrator can change game time."
        />
      ) : (
        <>
          <View
            style={{ gap: 10, padding: 16, backgroundColor: testRealm ? palette.mint : palette.soft, borderRadius: 12 }}
          >
            <View style={[ui.row, { justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }]}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: palette.ink }}>
                {testRealm ? 'Isolated test game' : 'Shared league game'}
              </Text>
              <Button
                compact
                variant="secondary"
                disabled={busy || !ready || !!saved || !!newGameDraft}
                onPress={() => void changeScope()}
              >
                {testRealm ? 'Return to shared league' : 'Open isolated test game'}
              </Button>
            </View>
            <Copy muted style={{ fontSize: 12 }}>
              {testRealm
                ? 'Only your test account and this test game are affected. Shared players and portfolios stay separate.'
                : 'Changes here affect every player. Open an isolated test game before experimenting.'}
            </Copy>
          </View>
          {localScopeReady && error && <Notice tone="error">{error}</Notice>}
          {clock?.error && <Notice tone="error">{synchronizationMessage(clock.error)}</Notice>}
          {localScopeReady && message && <Copy style={{ color: palette.green }}>{message}</Copy>}
          {localScopeReady && saved && !busy && (
            <Notice
              action={
                <Button
                  compact
                  variant="secondary"
                  onPress={() => {
                    setAdvanced(true);
                    void inspectSaved();
                  }}
                >
                  Check request
                </Button>
              }
            >
              {savedRequestText(savedState)}
            </Notice>
          )}
          {localScopeReady && busy && (
            <Copy muted>
              {processing || syncing ? 'Updating game time and processing reached events…' : 'Applying clock change…'}
            </Copy>
          )}
          <View style={{ gap: 12 }}>
            <View style={[ui.row, { justifyContent: 'space-between', flexWrap: 'wrap' }]}>
              <CardTitle>Game time</CardTitle>
              <Badge tone={syncing ? 'warning' : 'neutral'}>
                {finished ? 'Period complete' : syncing ? 'Synchronizing' : clock?.running ? 'Running · 1×' : 'Paused'}
              </Badge>
            </View>
            <Text
              style={{
                fontSize: 29,
                lineHeight: 36,
                fontWeight: '700',
                color: palette.ink,
                fontVariant: ['tabular-nums'],
              }}
            >
              {dateTime(clock?.targetNow || world.now)}
            </Text>
            <Copy muted style={{ fontSize: 12 }}>
              Available period: {dateTime(world.startsAt)} – {dateTime(world.endsAt)} ·{' '}
              {world.source === 'simulated' ? 'Simulated prices · test game' : 'Real historical prices'}
            </Copy>
            <Button disabled={controlsBlocked} onPress={() => void configure(clock?.running ? 'pause' : 'resume')}>
              {clock?.running ? 'Pause game clock' : 'Resume game clock'}
            </Button>
            {!clock && <Copy muted>Clock controls are unavailable. Refresh before changing time.</Copy>}
            {finished ? (
              <Copy muted>This price period has ended. Results remain saved. Start a new game to continue.</Copy>
            ) : (
              <Copy muted style={{ fontSize: 12 }}>
                Running advances one game second per server second. Time jumps process every reached event, then pause.
              </Copy>
            )}
          </View>
          {targets.error && (
            <Notice
              tone="error"
              action={
                <Button compact variant="secondary" onPress={() => void targets.refresh()}>
                  Retry
                </Button>
              }
            >
              {targets.error}
            </Notice>
          )}
          <View style={{ gap: 20 }}>
            <TargetAction
              title="Next market opening or closing"
              target={targetData?.nextMarketEvent}
              status={targetStatus}
              empty="No market opening or closing remains in this price period."
              disabled={controlsBlocked || !targetData?.nextMarketEvent}
              onPress={() => void configure('next')}
              button="Advance to market event"
            />
          </View>
          <View style={{ gap: 12 }}>
            <CardTitle>Choose game date and time</CardTitle>
            <DateTimeFields
              date={ready ? custom.date : ''}
              time={ready ? custom.time : ''}
              onDateChange={date => setCustom(value => ({ ...value, date }))}
              onTimeChange={time => setCustom(value => ({ ...value, time }))}
              minDate={israelDateTime(world.startsAt).date}
              maxDate={israelDateTime(world.endsAt).date}
              disabled={controlsBlocked}
            />
            <Button
              variant="secondary"
              disabled={controlsBlocked || !validIsraelDateTime(custom)}
              onPress={() => void configure('set')}
            >
              Apply time and pause
            </Button>
            <Copy muted style={{ fontSize: 12 }}>
              Choose a later time within this game’s price period. Israel daylight saving is checked by the server. For
              an earlier date, start a new game.
            </Copy>
          </View>
          {localScopeReady && suggestTestWorld && (
            <Copy muted>
              A game cannot move backwards.{' '}
              {testRealm
                ? 'Start a new test game below to choose another period.'
                : 'Open the isolated test game to try an earlier date without affecting shared players.'}
            </Copy>
          )}
          <View style={{ gap: 14 }}>
            <Button
              variant="secondary"
              disabled={!ready || busy || !!saved || syncing}
              onPress={() => setShowNewGame(value => !value)}
            >
              {showNewGame ? 'Close new-game settings' : 'Start a new game'}
            </Button>
            {ready && showNewGame && (
              <Card style={{ gap: 16 }}>
                <CardTitle>{testRealm ? 'Start a new test game' : 'Start a new shared game'}</CardTitle>
                <Copy>
                  {testRealm
                    ? 'This creates fresh virtual portfolios only in your isolated test game.'
                    : 'This switches every player to a new shared game with fresh virtual portfolios.'}{' '}
                  Past games, balances, orders and standings remain saved. Holdings and cash are not transferred.
                </Copy>
                {newGameDraft ? (
                  <>
                    <Copy>
                      A previously confirmed new-game request is saved. Retry keeps its original choice and request id.
                    </Copy>
                    <Button loading={busy} disabled={busy || syncing} onPress={() => void startNewGame()}>
                      Retry starting the new game
                    </Button>
                  </>
                ) : (
                  <>
                    {simulationAllowed && (
                      <View style={[ui.row, { flexWrap: 'wrap', gap: 8 }]}>
                        <Button
                          compact
                          variant={newGameMode === 'historical' ? 'primary' : 'secondary'}
                          onPress={() => setNewGameMode('historical')}
                        >
                          Real historical prices
                        </Button>
                        <Button
                          compact
                          variant={newGameMode === 'simulation' ? 'primary' : 'secondary'}
                          onPress={() => setNewGameMode('simulation')}
                        >
                          Simulated test prices
                        </Button>
                      </View>
                    )}
                    {newGameMode === 'simulation' && simulationAllowed ? (
                      <>
                        <Copy muted>
                          Simulated prices are invented for testing, never current or historical market quotes. The
                          separate game covers 28 calendar days from your chosen date.
                        </Copy>
                        <DateTimeFields
                          dateLabel="Starting date"
                          date={simulationDate}
                          onDateChange={setSimulationDate}
                          disabled={busy}
                        />
                      </>
                    ) : (
                      <>
                        {choices.error && <Copy muted>{choices.error}</Copy>}
                        {choices.data?.datasets
                          .filter(choice => choice.source === 'historical')
                          .map(choice => (
                            <View key={choice.id} style={{ gap: 6 }}>
                              <Button
                                compact
                                variant={selectedDatasetId === choice.id ? 'primary' : 'secondary'}
                                disabled={busy}
                                onPress={() => setDatasetId(choice.id)}
                              >
                                {dateTime(choice.startsAt)} – {dateTime(choice.endsAt)}
                              </Button>
                              <Copy muted style={{ fontSize: 12 }}>
                                {choice.sourceDescription}
                              </Copy>
                            </View>
                          ))}
                        {!choices.data?.datasets.some(choice => choice.source === 'historical') && (
                          <Copy muted>
                            No historical price period is available. Refresh the data list before starting a game.
                          </Copy>
                        )}
                      </>
                    )}
                    {!testRealm && (
                      <Copy style={{ color: palette.red, fontSize: 12 }}>
                        This changes the active game for all shared players. Use an isolated test game for practice.
                      </Copy>
                    )}
                    <Field
                      label="Type NEW GAME to confirm"
                      value={confirmation}
                      onChangeText={setConfirmation}
                      editable={!busy && !syncing}
                      autoCapitalize="characters"
                    />
                    <Button
                      variant="danger"
                      disabled={
                        confirmation !== 'NEW GAME' ||
                        busy ||
                        !!saved ||
                        syncing ||
                        (newGameMode === 'historical' &&
                          !choices.data?.datasets.some(choice => choice.source === 'historical')) ||
                        (newGameMode === 'simulation' && (!simulationAllowed || !validCalendarDate(simulationDate)))
                      }
                      loading={busy}
                      onPress={() => void startNewGame()}
                    >
                      {testRealm ? 'Create new test game' : 'Create new shared game'}
                    </Button>
                  </>
                )}
              </Card>
            )}
          </View>
          <View style={{ gap: 18 }}>
            <Button compact variant="quiet" onPress={() => setAdvanced(value => !value)}>
              {advanced ? 'Hide advanced controls ↑' : 'Advanced · history and recovery ↓'}
            </Button>
            {localScopeReady && advanced && (
              <>
                <Copy muted style={{ fontSize: 12 }}>
                  Israel time now: {clock ? dateTime(clock.serverNow) : 'Connecting…'} · Prices processed through{' '}
                  {dateTime(world.now)}.
                </Copy>
                {(saved || storageFailed || newGameDraft) && (
                  <View style={{ gap: 10 }}>
                    <CardTitle>Saved request recovery</CardTitle>
                    {saved && (
                      <>
                        <Copy>
                          {clockActionLabels[saved.action]}
                          {saved.targetIsrael
                            ? ` · ${saved.targetIsrael.date} ${saved.targetIsrael.time} Israel`
                            : saved.target
                              ? ` · ${dateTime(saved.target)}`
                              : ''}
                        </Copy>
                        <Copy muted>{savedRequestText(savedState)}</Copy>
                        <View style={[ui.row, { flexWrap: 'wrap' }]}>
                          <Button compact variant="secondary" disabled={busy} onPress={() => void inspectSaved()}>
                            Check server receipt
                          </Button>
                          <Button
                            compact
                            disabled={busy || savedState === 'checking' || syncing}
                            onPress={() => void configure(saved.action)}
                          >
                            Retry same request
                          </Button>
                        </View>
                      </>
                    )}
                    <Button compact variant="quiet" disabled={busy} onPress={() => void clearLocalRequest()}>
                      Check server and clear local retry data
                    </Button>
                    <Copy muted style={{ fontSize: 12 }}>
                      Clearing affects this device only. It does not cancel server jobs, accepted time changes or
                      orders.
                    </Copy>
                  </View>
                )}
                <View style={{ gap: 12 }}>
                  <CardTitle>Synchronization</CardTitle>
                  {world.job ? (
                    <>
                      <Copy>
                        {world.job.completedEvents} / {world.job.totalEvents} events completed ·{' '}
                        {number(world.job.processedPortfolios, 0)} account updates
                      </Copy>
                      {world.job.lastError && world.job.lastError !== clock?.error && (
                        <Copy style={{ color: palette.red }}>{synchronizationMessage(world.job.lastError)}</Copy>
                      )}
                      <View style={[ui.row, { flexWrap: 'wrap' }]}>
                        {processing ? (
                          <Button
                            compact
                            variant="secondary"
                            onPress={() => {
                              keepProcessing.current = false;
                            }}
                          >
                            Stop extra processing requests
                          </Button>
                        ) : (
                          <>
                            <Button compact loading={busy} disabled={busy} onPress={() => void step(true)}>
                              Resume synchronization
                            </Button>
                            <Button compact variant="secondary" disabled={busy} onPress={() => void step(false)}>
                              Process one step
                            </Button>
                          </>
                        )}
                      </View>
                    </>
                  ) : (
                    <Copy muted>
                      No unfinished job. The server catches up from saved clock anchors after sleep or restart.
                    </Copy>
                  )}
                </View>
                {ready && (
                  <View style={{ gap: 12 }}>
                    <CardTitle>Recent clock changes</CardTitle>
                    <ClockAudit key={storageKey} />
                  </View>
                )}
              </>
            )}
          </View>
        </>
      )}
    </AppShell>
  );
}

function TargetAction({
  title,
  target,
  status,
  empty,
  disabled,
  onPress,
  button,
}: {
  title: string;
  target?: EventTarget | null;
  status: string | null;
  empty: string;
  disabled: boolean;
  onPress(): void;
  button: string;
}) {
  const { palette } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <CardTitle>{title}</CardTitle>
      {target ? (
        <>
          <Text style={{ color: palette.ink, fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
            {dateTime(target.at)}
          </Text>
          <Copy muted>
            {target.market === 'US' ? 'United States' : 'Tel Aviv'} ·{' '}
            {target.kind === 'MARKET_OPEN' ? 'Market opens' : 'Market closes'}
          </Copy>
        </>
      ) : (
        <Copy muted>{status ?? empty}</Copy>
      )}
      <Button variant="secondary" disabled={disabled} onPress={onPress}>
        {button}
      </Button>
    </View>
  );
}

interface ClockAuditResponse {
  worldId: string;
  entries: { action: ClockAction; at: string; after: { running: boolean; anchorGameAt: string } }[];
}
function ClockAudit() {
  const resource = useApi<ClockAuditResponse>('/admin/clock/audit');
  return (
    <DataState
      loading={resource.loading}
      error={resource.error}
      hasData={!!resource.data}
      retry={() => void resource.refresh()}
    >
      <View style={{ gap: 12 }}>
        {resource.data?.entries.length === 0 && <Copy muted>No clock changes recorded in this game.</Copy>}
        {resource.data?.entries.map((entry, index) => (
          <View key={`${entry.at}/${index}`} style={{ gap: 4 }}>
            <Copy style={{ fontWeight: '600' }}>
              {clockActionLabels[entry.action] || entry.action} · {dateTime(entry.at)}
            </Copy>
            <Copy muted style={{ fontSize: 12 }}>
              Game time {dateTime(entry.after.anchorGameAt)} · {entry.after.running ? 'Running' : 'Paused'}
            </Copy>
          </View>
        ))}
      </View>
    </DataState>
  );
}

function savedRequestText(state: RequestState) {
  if (state === 'checking') return 'Checking a previous clock request with the server…';
  if (state === 'not_accepted')
    return 'The server has no record of this saved clock change. Retrying uses its original request id and inputs.';
  return 'The outcome of a previous clock change is unknown. Check its server receipt before retrying.';
}
function receiptPath(request: ClockRequest) {
  return `/admin/clock/requests/${encodeURIComponent(request.key)}?worldId=${encodeURIComponent(request.worldId)}`;
}
function receiptMessage(receipt: ClockReceipt) {
  if (receipt.processingStatus === 'syncing' || receipt.processingStatus === 'accepted')
    return 'The server already accepted the clock change. Processing continues safely; it was not submitted again.';
  if (receipt.processingStatus === 'superseded')
    return 'The server already accepted that change. A later clock action has replaced its setting; no retry is needed.';
  return 'The server confirmed the previous clock change. It is complete; no retry is needed.';
}
function synchronizationMessage(code: string) {
  if (code === 'DATA_INTEGRITY')
    return 'A required historical price or exchange rate is missing. Trading is paused. Restore the original data before resuming synchronization.';
  if (code === 'DATASET_MISMATCH')
    return 'The original price dataset for this game is unavailable. Restore its matching data file before resuming synchronization.';
  return 'A server processing step could not finish. Open Advanced and resume synchronization from its saved progress; do not submit the same order again.';
}
