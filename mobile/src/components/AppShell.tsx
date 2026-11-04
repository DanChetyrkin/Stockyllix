import { PropsWithChildren, useEffect, useState } from 'react';
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
  const independentPage = ['/help', '/current-market', '/news'].includes(pathname);
  const canUseWithoutPortfolio = independentPage || (pathname === '/admin' && game.isAdmin);
  const serverAnchor = game.world?.clock?.serverNow;
  const [israelNow, setIsraelNow] = useState<string | undefined>(serverAnchor);
  useEffect(() => {
    if (!serverAnchor) return;
    const received = performance.now();
    const update = () => setIsraelNow(new Date(Date.parse(serverAnchor) + performance.now() - received).toISOString());
    update();
    // this timer only displays server time; all trading time is enforced by the api.
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [serverAnchor]);
  const clock = game.world?.clock;
  const gameTime = clock ? new Date(Math.min(Date.parse(game.world!.endsAt), Date.parse(clock.targetNow) + (clock.running && serverAnchor && israelNow ? Math.max(0, Date.parse(israelNow) - Date.parse(serverAnchor)) : 0))).toISOString() : game.world?.now;
  if (auth.loading) return <View style={styles.fullLoading}><ActivityIndicator color={palette.green} /><Copy muted>Restoring your session…</Copy></View>;
  if (!auth.user) return <Redirect href="/auth" />;

  const pageHeader = <>
    <View style={[styles.header, compact && { paddingHorizontal: 14, gap: 8 }]}>
      <Link href="/" asChild><Pressable accessibilityLabel="Stockyllix portfolio" style={{ flexShrink: 1 }}><BrandLogo width={compact ? Math.max(80, Math.min(160, width - 236)) : 230} framed /></Pressable></Link>
      <View style={[styles.headerActions, compact && { gap: 8 }]}><NavigationMenu isAdmin={game.isAdmin} compact={compact} /><ProfileMenu compact={compact} /></View>
    </View>
    <View style={[styles.worldbar, compact && { paddingHorizontal: 20 }]}>
      <View style={{ gap: 5 }}>
        <Text style={styles.label}>{game.testRealm ? 'ISOLATED TEST WORLD' : 'SHARED GAME TIME'} · ASIA/JERUSALEM</Text>
        <Text style={styles.date}>{game.world ? day(gameTime) : 'Connecting to the league'}</Text>
        <Text style={styles.clock}>{clockTime(gameTime)} · {clock?.finished ? 'Period complete' : clock?.syncing ? 'Synchronizing events' : clock?.running ? 'Automatic · 1×' : 'Paused / custom'}</Text>
        <Text style={styles.clock}>Israel now: {israelNow ? `${day(israelNow)} · ${clockTime(israelNow)}` : 'Connecting to server time'}</Text>
      </View>
      <View style={{ gap: 10, alignItems: 'center' }}><WorldStatus /><ThemePicker /></View>
    </View>
  </>;

  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
    {!compact && pageHeader}
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      {/* the mobile header scrolls with the page instead of covering its content. */}
      {compact && pageHeader}
      <View style={[styles.content, compact && { padding: 20 }]}>
      <View style={styles.contentInner}>
        {game.testRealm && <Notice tone="neutral" action={<Button compact variant="secondary" onPress={() => void game.switchRealm(false)}>Return to shared world</Button>}>Isolated administrator test world. Shared players and balances are unaffected.</Notice>}
        {auth.initializing && <Notice>Preparing your portfolio securely… This may take a moment while the server wakes up.</Notice>}
        {auth.error && <Notice tone="error" action={<Button compact loading={auth.initializing} variant="secondary" onPress={() => void auth.retryInitialization()}>Try again</Button>}>{auth.error}</Notice>}
        {game.error && <Notice tone="error" action={<Button compact loading={game.refreshing} variant="secondary" onPress={() => void game.refreshWorld()}>Reconnect</Button>}>{game.error}</Notice>}
        {(independentPage || (game.world && (auth.initialized || canUseWithoutPortfolio))) ? children : !auth.error && !game.error && !auth.initializing && <Notice>Connecting to your portfolio…</Notice>}
        <View style={styles.footer}><Text style={styles.footerCopy}>STOCKYLLIX · HOUSE OF FINANCE HOME ASSIGNMENT</Text><Link href="/help" style={[styles.footerCopy, { color: palette.green }]}>How to play</Link><Text style={styles.footerCopy}>Virtual money. Educational play.</Text></View>
      </View>
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
