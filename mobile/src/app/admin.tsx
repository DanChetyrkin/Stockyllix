import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { api, errorMessage } from '@/api/client';
import { AppShell } from '@/components/AppShell';
import { Badge, Button, Card, CardTitle, Copy, Empty, Eyebrow, Field, Metric, Notice, PageTitle, useThemedStyles } from '@/components/ui/kit';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useGame } from '@/context/GameContext';
import { dateTime, number } from '@/utils/format';
import { useFeed } from '@/hooks/use-feed';

interface AdvanceRequest { target: string; key: string; worldId: string }
interface ReplayChoice { id: string; source: 'simulated' | 'historical'; sourceDescription: string; startsAt: string; endsAt: string }

export default function AdminScreen() {
  const { palette } = useTheme();
  const ui = useThemedStyles();
  const { world, isAdmin, refreshWorld } = useGame();
  const { user, retryInitialization } = useAuth();
  const [target, setTarget] = useState('');
  const [resetText, setResetText] = useState('');
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const choices = useFeed<{ datasets: ReplayChoice[] }>('/admin/datasets', isAdmin);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [savedAdvance, setSavedAdvance] = useState<AdvanceRequest | null>(null);
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | null>(null);
  const keepRunning = useRef(false);
  const mounted = useRef(true);
  const actionBusy = useRef(false);
  const storageKey = `stockyllix.clock.${user?.uid || 'signed-out'}`;
  const ready = loadedStorageKey === storageKey;

  useEffect(() => {
    mounted.current = true;
    let active = true;
    AsyncStorage.getItem(storageKey).then(value => { if (active) { setSavedAdvance(value ? JSON.parse(value) as AdvanceRequest : null); setLoadedStorageKey(storageKey); } }).catch(() => { if (active) setError('Could not load saved clock state. Reload before advancing.'); });
    return () => { active = false; mounted.current = false; keepRunning.current = false; };
  }, [storageKey]);

  async function advance() {
    if (!world || !isAdmin || actionBusy.current || !ready) return;
    let request = savedAdvance;
    if (!request) {
      const date = new Date(target);
      if (!target || Number.isNaN(date.getTime()) || !/(Z|[+-]\d{2}:\d{2})$/i.test(target)) { setError('Enter an ISO date with an explicit time zone, such as 2026-10-26T17:30:00+02:00.'); return; }
      request = { target: date.toISOString(), key: randomUUID(), worldId: world.id };
    }
    actionBusy.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await AsyncStorage.setItem(storageKey, JSON.stringify(request));
      setSavedAdvance(request);
      if (request.worldId !== world.id) throw new Error('This saved request belongs to an older world. Use “Clear old request” below after verifying the reset.');
      const result = await api<{ status: string; job: { id: string } | null }>('/admin/clock/advance', { method: 'POST', body: { worldId: request.worldId, target: request.target }, requestKey: request.key });
      await AsyncStorage.removeItem(storageKey);
      setSavedAdvance(null);
      setTarget('');
      await refreshWorld();
      if (result.job) await processJob(result.job.id, true);
      else setMessage('Game time is up to date.');
    } catch (cause) { setError(errorMessage(cause)); await refreshWorld(); }
    finally { actionBusy.current = false; keepRunning.current = false; setBusy(false); setRunning(false); }
  }

  async function processJob(jobId: string, auto: boolean) {
    if (!mounted.current) return;
    keepRunning.current = auto;
    setRunning(auto);
    // use the returned job, rather than waiting for react to refresh world state.
    for (let index = 0; index < 200; index += 1) {
      if (!mounted.current || (auto && !keepRunning.current)) return;
      const result = await api<{ status: string; job: { id: string } | null }>(`/admin/clock/jobs/${encodeURIComponent(jobId)}/step`, { method: 'POST' });
      await refreshWorld();
      if (result.status !== 'advancing' || !result.job) { setMessage('Game time updated. Orders and portfolios are ready to review.'); return; }
      if (!auto || !keepRunning.current) return;
      if (index < 199) await new Promise(resolve => setTimeout(resolve, 1200));
    }
    setMessage('Time is still updating. Choose “Resume & process” to continue from the saved progress.');
  }

  async function step(auto = false) {
    if (!world?.job || !isAdmin || actionBusy.current) return;
    const jobId = world.job.id;
    actionBusy.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await processJob(jobId, auto);
    } catch (cause) { setError(errorMessage(cause)); await refreshWorld(); }
    finally { actionBusy.current = false; keepRunning.current = false; setBusy(false); setRunning(false); }
  }

  async function reset() {
    if (!isAdmin || resetText !== 'RESET' || actionBusy.current) return;
    actionBusy.current = true;
    setBusy(true);
    setError(null);
    try {
      const resetKey = `${storageKey}.reset`;
      const stored = await AsyncStorage.getItem(resetKey);
      const request = stored ? JSON.parse(stored) as { key: string; worldId: string; datasetId?: string } : { key: randomUUID(), worldId: world!.id, datasetId: datasetId || world!.datasetId };
      if (!stored) await AsyncStorage.setItem(resetKey, JSON.stringify(request));
      await api('/admin/reset', { method: 'POST', body: { worldId: request.worldId, confirmation: 'RESET', ...(request.datasetId ? { datasetId: request.datasetId } : {}) }, requestKey: request.key });
      await AsyncStorage.removeItem(resetKey);
      await AsyncStorage.removeItem(storageKey);
      setSavedAdvance(null);
      setResetText('');
      await retryInitialization();
      await refreshWorld();
    } catch (cause) { setError(errorMessage(cause)); }
    finally { actionBusy.current = false; setBusy(false); }
  }

  return <AppShell>
    <PageTitle title="One world. One clock." subtitle="Move game time forward for everyone and process the scheduled market events." action={<Button compact variant="secondary" loading={busy} onPress={() => void refreshWorld()}>Refresh status</Button>} />
    {!world ? <Notice>Connecting to world controls…</Notice> : !isAdmin ? <Card><Empty title="Administrator access required." detail="Your account can trade and learn. A server-authorized administrator can advance or reset the shared world." /></Card> : <>
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      <View style={ui.metricGrid}><Metric dark label="CURRENT GAME TIME" value={dateTime(world.now)} detail="Israel time · shared by all players" /><Card style={{ flex: 1, minWidth: 270, gap: 12 }}><CardTitle>Available price period</CardTitle><Copy muted>This game includes prices from {dateTime(world.startsAt)} to {dateTime(world.endsAt)}, Israel time. The clock can advance within this period.</Copy><Copy muted style={{ fontSize: 12 }}>Moving time affects every player. Trading resumes after all crossed market events have finished processing.</Copy></Card></View>
      <View style={ui.split}>
        <Card style={{ flex: 1, minWidth: 270, gap: 20 }}><Eyebrow>Advance the world</Eyebrow><CardTitle>Choose the next moment.</CardTitle>
          <Field label="Target time (ISO with time zone)" value={target} onChangeText={setTarget} editable={!busy && world.status === 'idle' && !savedAdvance} placeholder="2026-10-26T17:30:00+02:00" hint={`Choose a time after ${dateTime(world.now)} and no later than ${dateTime(world.endsAt)} (Israel). “Use next event” fills the next opening or closing for you.`} autoCapitalize="none" />
          <View style={[ui.row, { flexWrap: 'wrap' }]}><Button compact variant="secondary" disabled={busy || world.status !== 'idle' || !!savedAdvance || !world.nextEvent} onPress={() => setTarget(world.nextEvent?.at || '')}>Use next event</Button><Button compact variant="quiet" disabled={busy || world.status !== 'idle' || !!savedAdvance} onPress={() => setTarget(new Date(Math.min(Date.parse(world.now) + 86400000, Date.parse(world.endsAt))).toISOString())}>+ 24 hours</Button></View>
          {savedAdvance && <Notice>Saved target: {dateTime(savedAdvance.target)}. You can safely retry if the previous response was interrupted.</Notice>}
          <Button loading={busy && !running} disabled={!ready || world.status !== 'idle' || busy} onPress={() => void advance()}>{savedAdvance ? 'Retry saved clock request' : 'Advance clock  →'}</Button>
          {savedAdvance && <Button compact variant="quiet" disabled={busy} onPress={() => { void AsyncStorage.removeItem(storageKey).then(() => { setSavedAdvance(null); setError(null); }).catch(cause => setError(errorMessage(cause))); }}>Clear saved request after checking world status</Button>}
          <Copy muted style={{ fontSize: 12 }}>Advancing starts processing automatically. You can reopen this screen and continue after an interruption. Pausing stops automatic steps; it does not cancel the advance.</Copy>
        </Card>
        <Card style={{ flex: 1, minWidth: 270, gap: 20 }}><Eyebrow>Processing status</Eyebrow><View style={[ui.row, { justifyContent: 'space-between' }]}><CardTitle>{world.job ? 'Ready to move forward.' : 'The world is up to date.'}</CardTitle><Badge tone={world.status === 'idle' ? 'positive' : 'warning'}>{world.status}</Badge></View>
          {world.job ? <><Text style={{ color: palette.ink, fontSize: 30, fontWeight: '700' }}>{world.job.completedEvents} / {world.job.totalEvents} <Text style={{ fontSize: 13, color: palette.muted }}>events completed</Text></Text><View style={{ height: 7, backgroundColor: palette.soft, borderRadius: 6, overflow: 'hidden' }}><View style={{ height: '100%', backgroundColor: palette.green, width: `${world.job.totalEvents ? Math.min(100, world.job.completedEvents / world.job.totalEvents * 100) : 0}%` }} /></View><Copy muted>{number(world.job.processedPortfolios, 0)} portfolio updates · {stageLabel(world.job.stage)}</Copy>{world.job.lastError && <Notice tone="error">{world.job.lastError}</Notice>}{running ? <Button variant="secondary" onPress={() => { keepRunning.current = false; }}>Pause after current step</Button> : <><Button loading={busy} disabled={busy} onPress={() => void step(true)}>Resume & process</Button><Button variant="secondary" disabled={busy} onPress={() => void step(false)}>Process one step</Button></>}</> : <Copy muted>Nothing is waiting to process. Choose a future time to run market openings, closings, currency updates and weekly rankings.</Copy>}
        </Card>
      </View>
      <Card style={{ gap: 17, borderColor: palette.errorBorder }}><Eyebrow>New demonstration</Eyebrow><CardTitle>Start a new world.</CardTitle><Copy muted>This creates a new world and a fresh virtual portfolio for every player. Previous worlds and their transactions are preserved. Prices are never replaced inside an existing world.</Copy>
        {world.finished && <Notice>This world has reached the end of its real or simulated price period. Start a new world to continue trading.</Notice>}
        {choices.error && <Copy muted>{choices.error}</Copy>}
        {choices.data?.datasets.map(choice => <View key={choice.id} style={{ gap: 5 }}><Button compact variant={(datasetId || world.datasetId) === choice.id ? 'primary' : 'secondary'} disabled={busy || world.status !== 'idle'} onPress={() => setDatasetId(choice.id)}>{choice.source === 'historical' ? 'Real historical replay' : 'Simulation'} · {dateTime(choice.startsAt)} – {dateTime(choice.endsAt)}</Button><Copy muted style={{ fontSize: 11 }}>{choice.sourceDescription}</Copy></View>)}
        <Field label="Type RESET to confirm" value={resetText} onChangeText={setResetText} editable={!busy && world.status === 'idle'} autoCapitalize="characters" /><Button variant="danger" disabled={resetText !== 'RESET' || busy || world.status !== 'idle'} loading={busy && !running} onPress={() => void reset()}>Start the selected shared world</Button></Card>
    </>}
  </AppShell>;
}

function stageLabel(stage: string): string {
  return stage === 'leaderboard' ? 'Updating weekly standings' : 'Processing market events';
}
