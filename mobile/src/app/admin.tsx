import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { api, ApiError, errorMessage } from '@/api/client';
import type { World } from '@/api/types';
import { AppShell } from '@/components/AppShell';
import { Badge, Button, Card, CardTitle, Copy, DataState, Empty, Field, Notice, PageTitle, useThemedStyles } from '@/components/ui/kit';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useGame } from '@/context/GameContext';
import { dateTime, number } from '@/utils/format';
import { useFeed } from '@/hooks/use-feed';
import { useApi } from '@/hooks/use-api';

type ClockAction = 'pause' | 'resume' | 'historical' | 'realtime' | 'set' | 'next';
interface ClockRequest { action: ClockAction; target?: string; key: string; worldId: string }
interface ReplayChoice { id: string; source: 'simulated' | 'historical'; sourceDescription: string; startsAt: string; endsAt: string }
const actionLabels: Record<ClockAction, string> = { pause: 'Pause clock', resume: 'Resume clock', historical: 'Historical playback', realtime: 'Real time', set: 'Set custom time', next: 'Next trading event' };

export default function AdminScreen() {
  const { palette } = useTheme();
  const ui = useThemedStyles();
  const { world, isAdmin, refreshWorld, testRealm, switchRealm } = useGame();
  const { user, retryInitialization } = useAuth();
  const [target, setTarget] = useState('');
  const [resetText, setResetText] = useState('');
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const choices = useFeed<{ datasets: ReplayChoice[] }>('/admin/datasets', isAdmin);
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState<ClockRequest | null>(null);
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | null>(null);
  const [storageFailed, setStorageFailed] = useState(false);
  const [showNewWorld, setShowNewWorld] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [suggestTestWorld, setSuggestTestWorld] = useState(false);
  const keepProcessing = useRef(false);
  const mounted = useRef(true);
  const actionBusy = useRef(false);
  const storageKey = `stockyllix.clock.${user?.uid || 'signed-out'}.${testRealm ? 'test' : 'shared'}.${world?.id || 'connecting'}`;
  const currentScope = useRef(storageKey);
  currentScope.current = storageKey;
  const localScopeReady = loadedStorageKey === storageKey;
  const ready = localScopeReady && !storageFailed && !!world;
  const clock = world?.clock;
  const finished = Boolean(world?.finished || clock?.finished);
  const selectedDatasetId = datasetId || choices.data?.datasets.find(choice => choice.source === 'historical')?.id || world?.datasetId;
  const controlsBlocked = busy || !ready || !!saved || world?.status !== 'idle' || finished || !clock;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; keepProcessing.current = false; };
  }, []);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(storageKey).then(value => {
      if (!active) return;
      const request = value ? JSON.parse(value) as ClockRequest : null;
      if (request && (!request.worldId || !request.key || !Object.prototype.hasOwnProperty.call(actionLabels, request.action))) throw new Error('Invalid saved clock request.');
      setSaved(request);
      setStorageFailed(false);
      setLoadedStorageKey(storageKey);
      setTarget('');
      setResetText('');
      setDatasetId(null);
      setError(null);
      setMessage(null);
      setShowAudit(false);
      setShowNewWorld(false);
      setSuggestTestWorld(false);
    }).catch(() => {
      if (!active) return;
      setSaved(null);
      setStorageFailed(true);
      setLoadedStorageKey(storageKey);
      setError('Could not read local clock request state. Check server status and clear the unreadable local retry data below.');
    });
    return () => { active = false; keepProcessing.current = false; };
  }, [storageKey]);

  function isCurrent(scope: string) { return mounted.current && currentScope.current === scope; }

  async function clearLocalRequest() {
    if (actionBusy.current || !localScopeReady) return;
    const scope = storageKey;
    actionBusy.current = true;
    setBusy(true);
    setError(null);
    try {
      await api('/world');
      await AsyncStorage.removeItem(scope);
      if (!isCurrent(scope)) return;
      setSaved(null);
      setStorageFailed(false);
      setMessage('Only local retry data was cleared. Server clock changes, processing jobs and orders remain saved.');
      await refreshWorld();
    } catch (cause) { if (isCurrent(scope)) setError(errorMessage(cause)); }
    finally { actionBusy.current = false; if (mounted.current) setBusy(false); }
  }

  async function changeScope() {
    if (!isAdmin || actionBusy.current || saved) return;
    actionBusy.current = true;
    setBusy(true);
    setError(null);
    try { await switchRealm(!testRealm); setSuggestTestWorld(false); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { actionBusy.current = false; setBusy(false); }
  }

  async function configure(action: ClockAction) {
    if (!world || !isAdmin || actionBusy.current || !ready) return;
    let request = saved;
    if (!request) {
      if (action === 'set') {
        const date = new Date(target);
        if (!target || Number.isNaN(date.getTime()) || !/(Z|[+-]\d{2}:\d{2})$/i.test(target)) {
          setError('Use an ISO date with its time zone, such as 2026-10-26T17:30:00+02:00.');
          return;
        }
        request = { action, target: date.toISOString(), key: randomUUID(), worldId: world.id };
      } else request = { action, key: randomUUID(), worldId: world.id };
    }
    const scope = storageKey;
    actionBusy.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      // retries retain the same action, world and request id.
      await AsyncStorage.setItem(scope, JSON.stringify(request));
      if (!isCurrent(scope)) return;
      setSaved(request);
      if (request.worldId !== world.id) throw new Error('This request belongs to an earlier world. Refresh status before clearing it.');
      const result = await api<{ world: World }>('/admin/clock/configure', { method: 'POST', body: { worldId: request.worldId, action: request.action, ...(request.target ? { target: request.target } : {}) }, requestKey: request.key });
      await AsyncStorage.removeItem(scope);
      if (!isCurrent(scope)) return;
      setSaved(null);
      setTarget('');
      await refreshWorld();
      if (result.world.job) await processJob(result.world.job.id, true, scope);
      else setMessage(request.action === 'pause' ? 'Game clock paused. Accepted orders remain saved.' : request.action === 'set' || request.action === 'next' ? 'Custom time applied. The clock is paused at this time.' : 'Historical playback is running at one game second per server second.');
    } catch (cause) {
      if (!isCurrent(scope)) return;
      if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500 && !['WORLD_ADVANCING', 'JOB_BUSY', 'LEASE_LOST'].includes(cause.code)) {
        await AsyncStorage.removeItem(scope).then(() => { if (isCurrent(scope)) setSaved(null); }).catch(() => undefined);
      }
      if (cause instanceof ApiError && cause.code === 'CLOCK_BACKWARD') { setSuggestTestWorld(true); if (testRealm) setShowNewWorld(true); }
      setError(errorMessage(cause));
      await refreshWorld();
    } finally {
      actionBusy.current = false;
      keepProcessing.current = false;
      if (mounted.current) { setBusy(false); setProcessing(false); }
    }
  }

  async function processJob(jobId: string, auto: boolean, scope: string) {
    keepProcessing.current = auto;
    setProcessing(auto);
    for (let index = 0; index < 200; index += 1) {
      if (!isCurrent(scope) || (auto && !keepProcessing.current)) return;
      try {
        const result = await api<{ status: string; job: { id: string } | null }>(`/admin/clock/jobs/${encodeURIComponent(jobId)}/step`, { method: 'POST' });
        await refreshWorld();
        if (!isCurrent(scope)) return;
        if (result.status !== 'advancing' || !result.job) { setMessage('Synchronization completed. Orders and account balances are up to date.'); return; }
      } catch (cause) {
        if (!(cause instanceof ApiError) || !['JOB_BUSY', 'LEASE_LOST', 'JOB_NOT_FOUND'].includes(cause.code)) throw cause;
        await refreshWorld();
        if (cause.code === 'JOB_NOT_FOUND' || !auto) { setMessage('Another server request is synchronizing time. Check the updated processing status.'); return; }
      }
      if (!auto || !keepProcessing.current) return;
      if (index < 199) await new Promise(resolve => setTimeout(resolve, 1200));
    }
    setMessage('Synchronization is still running. You can continue from its saved progress.');
  }

  async function step(auto: boolean) {
    if (!world?.job || !isAdmin || actionBusy.current) return;
    const scope = storageKey;
    actionBusy.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    try { await processJob(world.job.id, auto, scope); }
    catch (cause) { if (isCurrent(scope)) { setError(errorMessage(cause)); await refreshWorld(); } }
    finally { actionBusy.current = false; keepProcessing.current = false; if (mounted.current) { setBusy(false); setProcessing(false); } }
  }

  async function reset() {
    if (!world || !isAdmin || resetText !== 'RESET' || actionBusy.current || saved) return;
    const scope = storageKey;
    actionBusy.current = true;
    setBusy(true);
    setError(null);
    try {
      const resetKey = `${scope}.reset`;
      const stored = await AsyncStorage.getItem(resetKey);
      const request = stored ? JSON.parse(stored) as { key: string; worldId: string; datasetId?: string } : { key: randomUUID(), worldId: world.id, datasetId: selectedDatasetId };
      if (!stored) await AsyncStorage.setItem(resetKey, JSON.stringify(request));
      await api('/admin/reset', { method: 'POST', body: { worldId: request.worldId, confirmation: 'RESET', ...(request.datasetId ? { datasetId: request.datasetId } : {}) }, requestKey: request.key });
      await AsyncStorage.removeItem(resetKey);
      await AsyncStorage.removeItem(scope);
      if (!isCurrent(scope)) return;
      setSaved(null);
      setResetText('');
      setShowNewWorld(false);
      await retryInitialization();
      await refreshWorld();
    } catch (cause) { if (isCurrent(scope)) setError(errorMessage(cause)); }
    finally { actionBusy.current = false; if (mounted.current) setBusy(false); }
  }

  return <AppShell>
    <PageTitle title="World controls" subtitle="The server owns game time. Historical prices keep their original dates." action={<Button compact variant="secondary" loading={busy} onPress={() => void refreshWorld()}>Refresh status</Button>} />
    {!world ? <Copy muted>Connecting to world controls…</Copy> : !isAdmin ? <Empty title="Administrator access required." detail="Players can trade and view the shared clock. Only a server-authorized administrator can change it." /> : <>
      <View style={{ gap: 10, padding: 18, backgroundColor: testRealm ? palette.mint : palette.soft, borderRadius: 12 }}><View style={[ui.row, { justifyContent: 'space-between', flexWrap: 'wrap' }]}><Text style={{ fontSize: 16, fontWeight: '700', color: palette.ink }}>{testRealm ? 'Isolated test world' : 'Shared league world'}</Text><Button compact variant="secondary" disabled={busy || !ready || !!saved} onPress={() => void changeScope()}>{testRealm ? 'Return to shared league' : 'Open isolated test world'}</Button></View><Copy muted>{testRealm ? 'Time changes and test trades here do not affect the shared league or its players.' : 'Time changes here affect every participant. Use an isolated test world for experiments.'}</Copy></View>
      {localScopeReady && error && <Notice tone="error">{error}</Notice>}
      {localScopeReady && message && <Copy style={{ color: palette.green }}>{message}</Copy>}
      {localScopeReady && suggestTestWorld && <View style={{ gap: 8 }}><Copy muted>A world cannot move backwards. {testRealm ? 'Create a new test world below to begin an earlier price period.' : 'Open an isolated test world and create a new price period there.'}</Copy>{!testRealm && <Button compact variant="secondary" disabled={busy || !ready || !!saved} onPress={() => void changeScope()}>Open isolated test world</Button>}</View>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24 }}><ClockFigure label="Israel time now" value={clock ? dateTime(clock.serverNow) : 'Connecting…'} /><ClockFigure label="Game time" value={dateTime(clock?.targetNow || world.now)} /><View style={{ flex: 1, minWidth: 180, gap: 8 }}><Copy muted style={{ fontSize: 12 }}>Clock status</Copy><Badge tone={world.status === 'advancing' || clock?.syncing ? 'warning' : 'neutral'}>{finished ? 'Period complete' : world.status === 'advancing' || clock?.syncing ? 'Synchronizing' : clock?.running ? 'Running · 1×' : 'Paused'}</Badge><Copy muted style={{ fontSize: 12 }}>{clock?.mode === 'custom' ? 'Custom game time' : clock?.mode === 'realtime' ? 'Real time' : 'Historical playback'}</Copy></View></View>
      <Copy muted style={{ fontSize: 12 }}>Completed pricing through {dateTime(world.now)} · Available period: {dateTime(world.startsAt)} – {dateTime(world.endsAt)} · All times use Asia/Jerusalem, including daylight saving.</Copy>
      {clock?.error && <Notice tone="error">{synchronizationMessage(clock.error)}</Notice>}
      {!clock && <Copy muted>Automatic clock controls are temporarily unavailable. Refresh status before changing time.</Copy>}
      {finished && <Notice>The historical price period is complete. Results are preserved; new orders and further advancement are unavailable. Start a separate world to continue.</Notice>}
      {ready && saved && <View style={{ gap: 10 }}><Copy>Unconfirmed request: {actionLabels[saved.action]}{saved.target ? ` · ${dateTime(saved.target)}` : ''}. Retry uses the same request id.</Copy><View style={[ui.row, { flexWrap: 'wrap' }]}><Button compact loading={busy} disabled={!ready || busy} onPress={() => void configure(saved.action)}>Retry saved clock request</Button><Button compact variant="quiet" disabled={busy} onPress={() => void clearLocalRequest()}>Clear local request after checking status</Button></View></View>}
      {localScopeReady && storageFailed && <View style={{ gap: 8 }}><Button compact variant="secondary" disabled={busy} loading={busy} onPress={() => void clearLocalRequest()}>Check server and clear unreadable local request</Button><Copy muted style={{ fontSize: 12 }}>This removes only this device’s retry record. It does not cancel a server job or an accepted order.</Copy></View>}
      {!localScopeReady && <Copy muted>Reading this world’s local request state…</Copy>}
      <View style={{ gap: 16 }}><CardTitle>Playback</CardTitle><View style={[ui.row, { flexWrap: 'wrap', gap: 8 }]}><Button compact disabled={controlsBlocked || !clock?.running} onPress={() => void configure('pause')}>Pause clock</Button><Button compact variant="secondary" disabled={controlsBlocked || !!clock?.running} onPress={() => void configure('resume')}>Resume clock</Button><Button compact variant="secondary" disabled={controlsBlocked || (clock?.mode === 'historical' && !!clock.running)} onPress={() => void configure('historical')}>Run historical playback</Button><Button compact variant="secondary" disabled={controlsBlocked || !world.nextEvent} onPress={() => void configure('next')}>Next trading event</Button></View><Copy muted style={{ fontSize: 12 }}>Running playback advances one game second per server second. Pausing preserves accepted orders. Next trading event processes all events on the way, then pauses.</Copy></View>
      <Card style={{ gap: 16 }}><CardTitle>Custom game time</CardTitle><Field label="Target time (ISO with time zone)" value={ready ? target : ''} onChangeText={setTarget} editable={!controlsBlocked} placeholder="2026-10-26T17:30:00+02:00" hint={`Choose a future game time within the price period. Current game time: ${dateTime(clock?.targetNow || world.now)}. A time-zone suffix is required.`} autoCapitalize="none" /><Button disabled={controlsBlocked || !target} loading={busy && !processing} onPress={() => void configure('set')}>Set custom time and pause</Button><Copy muted style={{ fontSize: 12 }}>A forward jump processes crossed openings, closings, currency observations and weekly results once. It does not replace prices or rewind trades.</Copy></Card>
      <View style={{ gap: 12 }}><CardTitle>Real-time mode</CardTitle><Button compact variant="secondary" disabled={controlsBlocked || !clock?.realtimeAvailable} onPress={() => void configure('realtime')}>Use real time</Button><Copy muted style={{ fontSize: 12 }}>{clock?.realtimeUnavailableReason || 'Real-time trading is unavailable until current execution prices and FX are verified. Historical playback remains available.'}</Copy></View>
      <View style={{ gap: 14 }}><CardTitle>Synchronization</CardTitle>{world.job ? <><Text style={{ color: palette.ink, fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{world.job.completedEvents} / {world.job.totalEvents} events completed</Text><View style={{ height: 6, backgroundColor: palette.soft, borderRadius: 6, overflow: 'hidden' }}><View style={{ height: '100%', backgroundColor: palette.green, width: `${world.job.totalEvents ? Math.min(100, world.job.completedEvents / world.job.totalEvents * 100) : 0}%` }} /></View><Copy muted style={{ fontSize: 12 }}>{number(world.job.processedPortfolios, 0)} account updates · {world.job.stage === 'leaderboard' ? 'Weekly standings' : 'Market events'}</Copy>{world.job.lastError && world.job.lastError !== clock?.error && <Copy style={{ color: palette.red }}>{synchronizationMessage(world.job.lastError)}</Copy>}<View style={[ui.row, { flexWrap: 'wrap' }]}>{processing ? <Button compact variant="secondary" onPress={() => { keepProcessing.current = false; }}>Stop extra processing requests</Button> : <><Button compact loading={busy} disabled={busy} onPress={() => void step(true)}>Resume synchronization</Button><Button compact variant="secondary" disabled={busy} onPress={() => void step(false)}>Process one step</Button></>}</View></> : <Copy muted>No unfinished processing job. The server catches up from its saved clock after restarts or inactivity. Closing this page does not cancel accepted orders or change the clock mode.</Copy>}</View>
      <View style={{ gap: 14 }}><Button compact variant="quiet" onPress={() => setShowAudit(value => !value)}>{showAudit ? 'Hide clock history' : 'Recent clock changes'}</Button>{ready && showAudit && <ClockAudit key={storageKey} />}</View>
      <View style={{ gap: 14 }}><Button compact variant="quiet" onPress={() => setShowNewWorld(value => !value)}>{showNewWorld ? 'Hide new-world controls' : 'Start a separate price period'}</Button>{ready && showNewWorld && <Card style={{ gap: 16 }}><CardTitle>{testRealm ? 'Create a new test world' : 'Create a new shared world'}</CardTitle><Copy>This starts fresh virtual portfolios in the selected scope. Existing worlds, balances, orders and standings remain saved. It does not rewind or edit the current world.</Copy>{!testRealm && <Copy style={{ color: palette.red }}>This switches the shared league for every player. Prefer the isolated test world above when testing.</Copy>}{choices.error && <Copy muted>{choices.error}</Copy>}{choices.data?.datasets.map(choice => <View key={choice.id} style={{ gap: 5 }}><Button compact variant={selectedDatasetId === choice.id ? 'primary' : 'secondary'} disabled={busy || world.status !== 'idle' || !!saved} onPress={() => setDatasetId(choice.id)}>{choice.source === 'historical' ? 'Real historical prices' : 'Simulation'} · {dateTime(choice.startsAt)} – {dateTime(choice.endsAt)}</Button><Copy muted style={{ fontSize: 12 }}>{choice.sourceDescription}</Copy></View>)}<Field label="Type RESET to confirm" value={ready ? resetText : ''} onChangeText={setResetText} editable={!busy && world.status === 'idle' && !saved} autoCapitalize="characters" /><Button variant="danger" disabled={resetText !== 'RESET' || busy || world.status !== 'idle' || !!saved} loading={busy && !processing} onPress={() => void reset()}>{testRealm ? 'Create new test world' : 'Create new shared world'}</Button></Card>}</View>
    </>}
  </AppShell>;
}

function ClockFigure({ label, value }: { label: string; value: string }) {
  const { palette } = useTheme();
  return <View style={{ flex: 1, minWidth: 180, gap: 8 }}><Copy muted style={{ fontSize: 12 }}>{label}</Copy><Text style={{ fontSize: 24, fontWeight: '700', color: palette.ink, fontVariant: ['tabular-nums'] }}>{value}</Text></View>;
}

interface ClockAuditResponse { worldId: string; entries: { action: ClockAction; at: string; after: { mode: string; running: boolean; anchorGameAt: string } }[] }
function ClockAudit() {
  const resource = useApi<ClockAuditResponse>('/admin/clock/audit');
  return <DataState loading={resource.loading} error={resource.error} hasData={!!resource.data} retry={() => void resource.refresh()}><View style={{ gap: 12 }}>{resource.data?.entries.length === 0 && <Copy muted>No administrator clock changes recorded in this world.</Copy>}{resource.data?.entries.map((entry, index) => <View key={`${entry.at}/${index}`} style={{ gap: 4 }}><Copy style={{ fontWeight: '600' }}>{actionLabels[entry.action] || entry.action} · {dateTime(entry.at)}</Copy><Copy muted style={{ fontSize: 12 }}>Game time {dateTime(entry.after.anchorGameAt)} · {entry.after.running ? 'Running' : 'Paused'}</Copy></View>)}</View></DataState>;
}

function synchronizationMessage(code: string) {
  if (code === 'DATA_INTEGRITY') return 'A required historical price or exchange rate is missing. Trading is paused. Restore the original data before resuming synchronization.';
  if (code === 'DATASET_MISMATCH') return 'The original price dataset for this world is unavailable. Restore its matching data file before resuming synchronization.';
  return 'A server processing step could not finish. Refresh status or resume synchronization from its saved progress; do not submit the same order again.';
}
