import { useState } from 'react';
import { Link } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGame } from '@/context/GameContext';
import { useTheme } from '@/context/ThemeContext';
import { Button, Copy } from './ui/kit';
import { ReferenceRate } from './ReferenceRate';

export function WorldStatus() {
  const { world } = useGame();
  const { palette } = useTheme();
  const [open, setOpen] = useState(false);
  const advancing = world?.status === 'advancing';
  const source = !world ? 'Connecting' : world.source === 'simulated' ? 'Simulation' : 'Historical replay';
  const state = advancing ? 'Updating time' : world?.finished ? 'Period complete' : world ? 'Ready' : 'Please wait';

  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Game information. ${source}. ${state}.`} accessibilityHint="Shows the price source and shared clock status." accessibilityState={{ expanded: open }} onPress={() => setOpen(true)} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: palette.line, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: palette.paper }, pressed && { opacity: 0.75 }]}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: advancing ? palette.amber : palette.green }} /><Text style={{ color: palette.muted, fontSize: 11, fontWeight: '600' }}>{source} · {state}</Text><Text style={{ color: palette.green, fontSize: 13 }}>ⓘ</Text>
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(7, 30, 23, 0.38)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close game information" style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
        <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 440, maxHeight: '90%', borderRadius: 20, padding: 24, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, gap: 18 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><Text accessibilityRole="header" style={{ color: palette.ink, fontSize: 22, fontWeight: '700' }}>About this game</Text><Button compact variant="quiet" label="Close game information" onPress={() => setOpen(false)}>Close</Button></View>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 18 }}>
            <View style={{ gap: 5 }}><Text style={{ color: palette.ink, fontWeight: '700', fontSize: 13 }}>{advancing ? 'Game time is updating' : world?.finished ? 'This price period is complete' : world ? 'The game is ready' : 'Connecting to the league'}</Text><Copy muted>{advancing ? 'Trading pauses while market events are processed. Your last completed data stays visible. The administrator can resume processing from World controls.' : world?.finished ? 'There are no future prices in this world. Your results remain saved. An administrator can start a separate historical world from World controls.' : 'Everyone shares the same game clock. An administrator advances it so you can see orders execute without waiting for real markets.'}</Copy></View>
            <View style={{ gap: 5 }}><Text style={{ color: palette.ink, fontWeight: '700', fontSize: 13 }}>{world?.source === 'simulated' ? 'Simulated asset prices' : world ? 'Historical price replay' : 'Price data'}</Text><Copy muted>{world?.sourceDescription || 'Price source details appear when the league connects.'}</Copy></View>
            <Copy muted>All cash and investments are virtual. The game is for learning; it does not send orders to a broker.</Copy>
            {open && <ReferenceRate />}
          </ScrollView>
          <Link href="/help" asChild><Button variant="secondary" onPress={() => setOpen(false)}>How to play  →</Button></Link>
        </View>
      </View>
    </Modal>
  </>;
}
