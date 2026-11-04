import { useState } from 'react';
import { Link } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGame } from '@/context/GameContext';
import { useTheme } from '@/context/ThemeContext';
import { dateTime } from '@/utils/format';
import { Button, Copy } from './ui/kit';
import { ReferenceRate } from './ReferenceRate';

export function WorldStatus() {
  const { world, isAdmin, testRealm } = useGame();
  const { palette } = useTheme();
  const [open, setOpen] = useState(false);
  const clock = world?.clock;
  const syncing = world?.status === 'advancing' || clock?.syncing;
  const finished = world?.finished || clock?.finished;
  const source = !world ? 'Connecting' : world.source === 'simulated' ? 'Simulation' : 'Historical replay';
  const state = clock?.error ? 'Needs attention' : syncing ? 'Synchronizing' : finished ? 'Period complete' : !world ? 'Please wait' : clock ? clock.running ? 'Running · 1×' : 'Paused' : 'Ready';
  const explanation = clock?.error ? 'The server could not complete a pricing event. Accepted orders remain saved. The administrator can inspect the data and resume synchronization.' : syncing ? 'The server is processing reached market events in order. Trading pauses until balances, orders and standings are consistent.' : finished ? 'There are no future prices in this world. Results remain saved. An administrator can create a separate world to continue.' : clock && !clock.running ? 'The game clock is paused. Pending orders keep their reservations and wait for their scheduled event. An administrator can resume the clock.' : clock ? 'Historical playback advances one game second per server second. The server catches up when the app reconnects; your device does not decide execution time.' : 'Everyone shares this game clock. Check World controls for its playback status.';

  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Game information. ${source}. ${state}.`} accessibilityHint="Shows the price source and shared clock status." accessibilityState={{ expanded: open }} onPress={() => setOpen(true)} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: palette.soft }, pressed && { opacity: 0.75 }]}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: clock?.error ? palette.red : syncing ? palette.amber : palette.green }} /><Text style={{ color: palette.muted, fontSize: 11, fontWeight: '600' }}>{source} · {state}</Text><Text style={{ color: palette.green, fontSize: 13 }}>ⓘ</Text>
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(7, 30, 23, 0.38)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close game information" style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
        <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 460, maxHeight: '90%', borderRadius: 16, padding: 24, backgroundColor: palette.paper, gap: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><Text accessibilityRole="header" style={{ color: palette.ink, fontSize: 22, fontWeight: '700' }}>Clock and prices</Text><Button compact variant="quiet" label="Close game information" onPress={() => setOpen(false)}>Close</Button></View>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 20 }}>
            {testRealm && <Copy style={{ color: palette.green, fontWeight: '600' }}>Isolated test world · Shared-league funds and time are unaffected.</Copy>}
            <View style={{ gap: 6 }}><Text style={{ color: palette.ink, fontWeight: '700', fontSize: 14 }}>{state}</Text><Copy muted>{explanation}</Copy></View>
            {world && <View style={{ gap: 8 }}><Copy>Game time: {dateTime(clock?.targetNow || world.now)}</Copy>{clock && <Copy>Israel time now: {dateTime(clock.serverNow)}</Copy>}<Copy muted style={{ fontSize: 12 }}>Prices processed through {dateTime(world.now)}. Both clock displays use Asia/Jerusalem and its daylight saving rules.</Copy></View>}
            <View style={{ gap: 6 }}><Text style={{ color: palette.ink, fontWeight: '700', fontSize: 14 }}>{world?.source === 'simulated' ? 'Simulated asset prices' : world ? 'Historical price replay' : 'Price data'}</Text><Copy muted>{world?.sourceDescription || 'Price source details appear when the league connects.'}</Copy><Copy muted style={{ fontSize: 12 }}>Current market and news follow real-world time. They never replace a historical execution price.</Copy></View>
            <Copy muted>All cash and investments are virtual. Orders are not sent to a broker.</Copy>
            {open && <ReferenceRate />}
          </ScrollView>
          <View style={{ gap: 8 }}>{isAdmin && <Link href="/admin" asChild><Button variant="secondary" onPress={() => setOpen(false)}>World controls</Button></Link>}<Link href="/help" asChild><Button variant="quiet" onPress={() => setOpen(false)}>How to play</Button></Link></View>
        </View>
      </View>
    </Modal>
  </>;
}
