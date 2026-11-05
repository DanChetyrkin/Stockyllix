import { PropsWithChildren } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, TextInputProps, useWindowDimensions, View, ViewStyle } from 'react-native';
import { darkPalette, lightPalette, type ThemePalette, type ThemePreference } from '@/config/theme';
import { useTheme } from '@/context/ThemeContext';
import { useGame } from '@/context/GameContext';

export function Copy({ children, muted = false, style }: PropsWithChildren<{ muted?: boolean; style?: object }>) {
  const { palette } = useTheme();
  const ui = useThemedStyles();
  return <Text style={[ui.copy, muted && { color: palette.muted }, style]}>{children}</Text>;
}

export function Eyebrow({ children }: PropsWithChildren) {
  const ui = useThemedStyles();
  return <Text style={ui.eyebrow}>{children}</Text>;
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  const ui = useThemedStyles();
  const compact = useWindowDimensions().width < 600;
  return <View style={[ui.pageHeading, compact && { flexDirection: 'column', alignItems: 'stretch' }]}><View style={{ flex: 1, gap: 6 }}><Text accessibilityRole="header" style={[ui.title, compact && { fontSize: 28, letterSpacing: -0.6 }]}>{title}</Text><Copy muted>{subtitle}</Copy></View>{action && <View style={{ alignSelf: 'flex-start' }}>{action}</View>}</View>;
}

export function Card({ children, style, dark = false }: PropsWithChildren<{ style?: ViewStyle | ViewStyle[]; dark?: boolean }>) {
  const { palette } = useTheme();
  const ui = useThemedStyles();
  return <View style={[ui.card, dark && { backgroundColor: palette.dark, borderColor: palette.dark }, style]}>{children}</View>;
}

export function CardTitle({ children }: PropsWithChildren) {
  const ui = useThemedStyles();
  return <Text accessibilityRole="header" style={ui.cardTitle}>{children}</Text>;
}

export function Button({ children, onPress, loading, disabled, variant = 'primary', compact = false, label }: PropsWithChildren<{
  onPress(): void; loading?: boolean; disabled?: boolean; variant?: 'primary' | 'secondary' | 'danger' | 'quiet'; compact?: boolean; label?: string;
}>) {
  const { palette } = useTheme();
  const ui = useThemedStyles();
  const blocked = loading || disabled;
  const primary = variant === 'primary' || variant === 'danger';
  const foreground = variant === 'danger' ? palette.onDanger : primary ? palette.onPrimary : palette.ink;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!blocked, busy: !!loading }} disabled={blocked} onPress={onPress} style={({ pressed }) => [
    ui.button, compact && { minHeight: 38, paddingHorizontal: 14, paddingVertical: 8 },
    variant === 'secondary' && ui.secondaryButton, variant === 'quiet' && ui.quietButton,
    variant === 'danger' && { backgroundColor: palette.danger }, blocked && { opacity: 0.5 }, pressed && !blocked && { opacity: 0.8 },
  ]}>
    {loading && <ActivityIndicator size="small" color={foreground} />}
    <Text style={[ui.buttonText, { color: foreground }]}>{children}</Text>
  </Pressable>;
}

export function Field({ label, hint, trailing, ...props }: TextInputProps & { label: string; hint?: string; trailing?: React.ReactNode }) {
  const { palette } = useTheme();
  const ui = useThemedStyles();
  return <View style={{ gap: 7 }}><Text style={ui.fieldLabel}>{label}</Text><View style={{ position: 'relative' }}><TextInput accessibilityLabel={label} placeholderTextColor={palette.placeholder} {...props} style={[ui.input, props.style, trailing ? { paddingRight: 56 } : undefined]} />{trailing && <View style={{ position: 'absolute', right: 3, top: 0, bottom: 0, justifyContent: 'center' }}>{trailing}</View>}</View>{hint && <Copy muted style={{ fontSize: 12 }}>{hint}</Copy>}</View>;
}

export function Badge({ children, tone = 'neutral' }: PropsWithChildren<{ tone?: 'neutral' | 'positive' | 'warning' | 'negative' }>) {
  const { palette } = useTheme();
  const ui = useThemedStyles();
  const colors = { neutral: [palette.background, palette.muted], positive: [palette.mint, palette.green], warning: [palette.amberBg, palette.amber], negative: [palette.redBg, palette.red] }[tone];
  return <View style={[ui.badge, { backgroundColor: colors[0] }]}><Text style={[ui.badgeText, { color: colors[1] }]}>{children}</Text></View>;
}

export function Notice({ children, tone = 'neutral', action }: PropsWithChildren<{ tone?: 'neutral' | 'warning' | 'error' | 'success'; action?: React.ReactNode }>) {
  const { palette } = useTheme();
  const ui = useThemedStyles();
  const stacked = useWindowDimensions().width < 600 && !!action;
  return <View accessibilityRole={tone === 'error' ? 'alert' : undefined} style={[ui.notice, stacked && { flexDirection: 'column', alignItems: 'stretch' }, tone === 'error' && { backgroundColor: palette.redBg, borderColor: palette.errorBorder }, tone === 'warning' && { backgroundColor: palette.amberBg, borderColor: palette.warningBorder }, tone === 'success' && { backgroundColor: palette.mint }]}><Copy style={stacked ? undefined : { flex: 1 }}>{children}</Copy>{action}</View>;
}

export function Metric({ label, value, detail, tone, dark = false }: { label: string; value: string; detail: string; tone?: 'positive' | 'negative'; dark?: boolean }) {
  const { palette } = useTheme();
  const ui = useThemedStyles();
  return <Card dark={dark} style={{ flex: 1, minWidth: 180, gap: 12 }}>
    <Text style={[ui.metricLabel, dark && { color: palette.mutedOnDark }]}>{label}</Text>
    <Text style={[ui.metricValue, dark && { color: palette.onDark }, tone === 'positive' && { color: dark ? palette.positiveOnDark : palette.green }, tone === 'negative' && { color: dark ? palette.negativeOnDark : palette.red }]}>{value}</Text>
    <Text style={[ui.metricDetail, dark && { color: palette.mutedOnDark }]}>{detail}</Text>
  </Card>;
}

export function Empty({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) {
  const { palette } = useTheme();
  const ui = useThemedStyles();
  return <View style={ui.empty}><View style={ui.emptyMark}><Text style={{ color: palette.green, fontSize: 24 }}>↗</Text></View><CardTitle>{title}</CardTitle><Copy muted style={{ textAlign: 'center', maxWidth: 440 }}>{detail}</Copy>{action}</View>;
}

// a centred panel over a dimmed page. with a dismiss label, tapping outside closes it.
export function Dialog({ visible, onClose, dismissLabel, children }: PropsWithChildren<{ visible: boolean; onClose(): void; dismissLabel?: string }>) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={{ flex: 1, backgroundColor: 'rgba(7, 30, 23, 0.45)', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      {dismissLabel && <Pressable accessibilityRole="button" accessibilityLabel={dismissLabel} style={StyleSheet.absoluteFill} onPress={onClose} />}
      {children}
    </View>
  </Modal>;
}

export function DataState({ loading, error, retry, children, hasData }: PropsWithChildren<{ loading: boolean; error: string | null; retry(): void; hasData: boolean }>) {
  const { palette } = useTheme();
  const { world } = useGame();
  const ui = useThemedStyles();
  const paused = world?.status === 'advancing' || world?.clock?.syncing;
  return <>{error && <Notice tone="error" action={<Button compact variant="secondary" onPress={retry}>Retry</Button>}>{error}</Notice>}
    {!hasData && paused ? <View style={ui.loading}><Copy muted style={{ textAlign: 'center', maxWidth: 450 }}>Game time is updating. Your data will appear when processing finishes.</Copy></View> : loading && !hasData ? <View style={ui.loading}><ActivityIndicator color={palette.green} /><Copy muted>Loading your latest game data…</Copy></View> : children}
  </>;
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
  copy: { color: palette.ink, fontSize: 14, lineHeight: 22 },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 1.1, color: palette.green, textTransform: 'uppercase' },
  title: { fontSize: 32, fontWeight: '700', color: palette.ink, letterSpacing: -0.8 },
  pageHeading: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 4 },
  card: { backgroundColor: palette.paper, borderRadius: 14, padding: 24 },
  cardTitle: { color: palette.ink, fontWeight: '700', fontSize: 18, letterSpacing: -0.4 },
  button: { backgroundColor: palette.primary, minHeight: 46, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9 },
  buttonText: { color: palette.onPrimary, fontSize: 13, fontWeight: '700' },
  secondaryButton: { backgroundColor: palette.soft },
  quietButton: { backgroundColor: 'transparent' },
  fieldLabel: { color: palette.ink, fontSize: 13, fontWeight: '600' },
  input: { backgroundColor: palette.paper, minHeight: 48, borderWidth: 1, borderColor: palette.inputBorder, paddingHorizontal: 14, paddingVertical: 12, color: palette.ink, fontSize: 15, borderRadius: 9 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  notice: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: 16, backgroundColor: palette.soft, borderRadius: 10 },
  metricLabel: { fontSize: 12, color: palette.muted, fontWeight: '600' },
  metricValue: { fontSize: 29, color: palette.ink, fontWeight: '700', letterSpacing: -0.7, fontVariant: ['tabular-nums'] },
  metricDetail: { fontSize: 12, lineHeight: 18, color: palette.muted },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  split: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' },
  divider: { height: 1, backgroundColor: palette.line },
  empty: { paddingVertical: 40, paddingHorizontal: 20, alignItems: 'center', gap: 14 },
  emptyMark: { width: 48, height: 48, backgroundColor: palette.mint, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  loading: { minHeight: 180, justifyContent: 'center', alignItems: 'center', gap: 15 },
  tableHeader: { flexDirection: 'row', paddingVertical: 13, borderBottomWidth: 1, borderColor: palette.line, gap: 12, backgroundColor: palette.tableHead },
  tableRow: { flexDirection: 'row', paddingVertical: 18, borderBottomWidth: 1, borderColor: palette.tableLine, alignItems: 'center', gap: 12 },
  cell: { flex: 1, minWidth: 80, fontSize: 13, color: palette.ink, fontVariant: ['tabular-nums'] },
  tableLabel: { fontSize: 10, fontWeight: '700', color: palette.muted, textTransform: 'uppercase', letterSpacing: 0.8 },
  });
}

const styleSheets = { light: createStyles(lightPalette), dark: createStyles(darkPalette) };
export function useThemedStyles() {
  return styleSheets[useTheme().mode];
}

export function ThemePicker() {
  const { preference, setPreference, palette, error } = useTheme();
  const choices: { value: ThemePreference; label: string }[] = [
    { value: 'auto', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' },
  ];
  return <View style={{ gap: 5, alignItems: 'flex-start' }}>
    <View accessibilityLabel="Appearance" style={{ flexDirection: 'row', gap: 3, padding: 3, backgroundColor: palette.soft, borderRadius: 9 }}>
      {choices.map(choice => <Pressable key={choice.value} accessibilityRole="button" accessibilityLabel={`${choice.label} appearance${choice.value === 'auto' ? ', dark from 8 PM to 7 AM Israel time' : ''}`} accessibilityState={{ selected: preference === choice.value }} onPress={() => setPreference(choice.value)} style={({ pressed }) => ({ minHeight: 36, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 6, backgroundColor: preference === choice.value ? palette.primary : 'transparent', opacity: pressed ? 0.75 : 1 })}>
        <Text style={{ fontSize: 11, fontWeight: '600', color: preference === choice.value ? palette.onPrimary : palette.muted }}>{choice.label}</Text>
      </Pressable>)}
    </View>
    {error && <Text accessibilityRole="alert" style={{ color: palette.red, fontSize: 11, maxWidth: 300 }}>{error}</Text>}
  </View>;
}
