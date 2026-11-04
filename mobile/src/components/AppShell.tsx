import { PropsWithChildren } from 'react';
import { Link, Redirect, usePathname } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { useGame } from '@/context/GameContext';
import { useTheme } from '@/context/ThemeContext';
import { clockTime, day } from '@/utils/format';
import { BrandLogo } from './BrandLogo';
import { NavigationMenu } from './NavigationMenu';
import { ProfileMenu } from './ProfileMenu';
import { WorldStatus } from './WorldStatus';
import { Button, Copy, Notice, ThemePicker } from './ui/kit';

export function AppShell({ children }: PropsWithChildren) {
  const auth = useAuth();
  const game = useGame();
  const { palette } = useTheme();
  const styles = makeStyles(palette);
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const compact = width < 900;
  const canUseWithoutPortfolio = pathname === '/help' || (pathname === '/admin' && game.isAdmin);
  if (auth.loading) return <View style={styles.fullLoading}><ActivityIndicator color={palette.green} /><Copy muted>Restoring your session…</Copy></View>;
  if (!auth.user) return <Redirect href="/auth" />;

  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
    <View style={[styles.header, compact && { paddingHorizontal: 14, gap: 8 }]}>
      <Link href="/" asChild><Pressable accessibilityLabel="Stockyllix portfolio" style={{ flexShrink: 1 }}><BrandLogo width={compact ? Math.max(80, Math.min(160, width - 236)) : 230} framed /></Pressable></Link>
      <View style={[styles.headerActions, compact && { gap: 8 }]}><NavigationMenu isAdmin={game.isAdmin} compact={compact} /><ProfileMenu compact={compact} /></View>
    </View>
    <View style={[styles.worldbar, compact && { paddingHorizontal: 20 }]}>
      <View style={{ gap: 5 }}>
        <Text style={styles.label}>YOUR SHARED WORLD</Text>
        <Text style={styles.date}>{game.world ? day(game.world.now) : 'Connecting to the league'}</Text>
        <Text style={styles.clock}>{clockTime(game.world?.now)} · Israel time · game clock</Text>
      </View>
      <View style={{ gap: 10, alignItems: 'center' }}><WorldStatus /><ThemePicker /></View>
    </View>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, compact && { padding: 20 }]} keyboardShouldPersistTaps="handled">
      <View style={styles.contentInner}>
        {auth.initializing && <Notice>Preparing your portfolio securely… This may take a moment while the server wakes up.</Notice>}
        {auth.error && <Notice tone="error" action={<Button compact loading={auth.initializing} variant="secondary" onPress={() => void auth.retryInitialization()}>Try again</Button>}>{auth.error}</Notice>}
        {game.error && <Notice tone="error" action={<Button compact loading={game.refreshing} variant="secondary" onPress={() => void game.refreshWorld()}>Reconnect</Button>}>{game.error}</Notice>}
        {(pathname === '/help' || (game.world && (auth.initialized || canUseWithoutPortfolio))) ? children : !auth.error && !game.error && !auth.initializing && <Notice>Connecting to your portfolio…</Notice>}
        <View style={styles.footer}><Text style={styles.footerCopy}>STOCKYLLIX · HOUSE OF FINANCE HOME ASSIGNMENT</Text><Link href="/help" style={[styles.footerCopy, { color: palette.green }]}>How to play</Link><Text style={styles.footerCopy}>Virtual money. Educational play.</Text></View>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const makeStyles = (palette: ReturnType<typeof useTheme>['palette']) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  fullLoading: { flex: 1, backgroundColor: palette.background, alignItems: 'center', justifyContent: 'center', gap: 18 },
  header: { minHeight: 92, backgroundColor: palette.paper, paddingHorizontal: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 24, borderBottomWidth: 1, borderColor: palette.line },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  worldbar: { minHeight: 110, backgroundColor: palette.paper, borderBottomWidth: 1, borderColor: palette.line, paddingVertical: 18, paddingHorizontal: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  label: { color: palette.muted, fontSize: 9, fontWeight: '700', letterSpacing: 1.3 },
  date: { color: palette.ink, fontSize: 15, fontWeight: '600' },
  clock: { color: palette.muted, fontSize: 12, fontVariant: ['tabular-nums'] },
  content: { padding: 36, flexGrow: 1 },
  contentInner: { width: '100%', maxWidth: 1250, alignSelf: 'center', gap: 22, flexGrow: 1 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, borderTopWidth: 1, borderColor: palette.line, paddingTop: 20, marginTop: 24 },
  footerCopy: { color: palette.muted, fontSize: 8, fontWeight: '600', letterSpacing: 0.7 },
});
