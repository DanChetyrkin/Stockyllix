import { useState } from 'react';
import { Link, usePathname, type Href } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

const pages = [
  { href: '/', label: 'Portfolio', group: 'INVEST', detail: 'Cash and your holdings' },
  { href: '/current-market', label: 'Current market', group: 'INVEST', detail: 'Real-world quotes · delayed data' },
  { href: '/market', label: 'Demo trading', group: 'INVEST', detail: 'Trade within the shared game period' },
  { href: '/news', label: 'Market news', group: 'LEARN & COMPETE', detail: 'Headlines from the real world' },
  { href: '/orders', label: 'Orders', group: 'INVEST', detail: 'Pending and completed orders' },
  { href: '/daily-review', label: 'Daily review', group: 'LEARN & COMPETE', detail: 'Your personal daily check-in' },
  { href: '/leaderboard', label: 'The league', group: 'LEARN & COMPETE', detail: 'Weekly return and stability' },
  { href: '/help', label: 'How to play', group: 'HELP', detail: 'A friendly guide to Stockyllix' },
];

export function NavigationMenu({ isAdmin, compact }: { isAdmin: boolean; compact: boolean }) {
  const { palette } = useTheme();
  const styles = makeStyles(palette);
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = [...pages, ...(isAdmin ? [{ href: '/admin', label: 'World controls', group: 'ADMINISTRATION', detail: 'Advance the shared game clock' }] : [])];
  const current = items.find(item => item.href === pathname)?.label || 'Navigate';

  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Open navigation menu. Current page: ${current}`} accessibilityState={{ expanded: open }} onPress={() => setOpen(true)} style={[styles.trigger, compact ? { width: 96, minWidth: 96, gap: 8 } : { minWidth: 140, maxWidth: 190 }]}>
      <Text style={styles.current}>{compact ? 'Menu' : current}</Text><View style={[styles.chevron, { transform: [{ rotate: open ? '225deg' : '45deg' }] }]} />
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="Dismiss navigation menu" style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
        <View accessibilityViewIsModal style={styles.panel}>
          <View style={styles.panelHeader}><Text accessibilityRole="header" style={styles.title}>Your league</Text><Pressable accessibilityRole="button" accessibilityLabel="Close navigation menu" onPress={() => setOpen(false)} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable></View>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 3 }}>{items.map((item, index) => <View key={item.href}>
            {items[index - 1]?.group !== item.group && <Text style={styles.group}>{item.group}</Text>}
            <Link href={item.href as Href} asChild><Pressable accessibilityRole="link" accessibilityLabel={item.label} onPress={() => setOpen(false)} style={StyleSheet.flatten([styles.item, pathname === item.href && styles.active])}>
              <View style={{ flex: 1, gap: 4 }}><Text style={styles.label}>{item.label}</Text><Text style={styles.detail}>{item.detail}</Text></View><Text style={styles.arrow}>{pathname === item.href ? '●' : '→'}</Text>
            </Pressable></Link>
          </View>)}</ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}

const makeStyles = (palette: ReturnType<typeof useTheme>['palette']) => StyleSheet.create({
  trigger: { minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: palette.inputBorder, backgroundColor: palette.paper, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  current: { color: palette.ink, fontSize: 14, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  chevron: { width: 7, height: 7, borderRightWidth: 1.5, borderBottomWidth: 1.5, borderColor: palette.green, marginTop: -3 },
  overlay: { flex: 1, backgroundColor: 'rgba(7, 30, 23, 0.38)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  panel: { width: '100%', maxWidth: 420, maxHeight: '90%', borderRadius: 20, backgroundColor: palette.paper, padding: 22, borderWidth: 1, borderColor: palette.line, gap: 4 },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, title: { color: palette.ink, fontSize: 23, fontWeight: '700' },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: palette.background }, closeText: { color: palette.ink, fontSize: 25 },
  group: { color: palette.muted, fontSize: 9, letterSpacing: 1.2, fontWeight: '700', marginTop: 16, marginBottom: 7 },
  item: { paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }, active: { backgroundColor: palette.mint },
  label: { color: palette.ink, fontSize: 14, fontWeight: '600' }, detail: { color: palette.muted, fontSize: 11 }, arrow: { color: palette.green, fontSize: 16 },
});
