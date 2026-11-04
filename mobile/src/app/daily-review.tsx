import { useCallback, useState } from 'react';
import { Link, useFocusEffect } from 'expo-router';
import { Text, View } from 'react-native';
import { api, errorMessage } from '@/api/client';
import { PortfolioResponse } from '@/api/types';
import { AppShell } from '@/components/AppShell';
import { DailyQuiz } from '@/components/DailyQuiz';
import { Badge, Button, Card, CardTitle, Copy, DataState, Eyebrow, Metric, Notice, PageTitle, useThemedStyles } from '@/components/ui/kit';
import { useAuth } from '@/context/AuthContext';
import { useGame } from '@/context/GameContext';
import { useTheme } from '@/context/ThemeContext';
import { useApi } from '@/hooks/use-api';
import { money, observationDate, percent } from '@/utils/format';

export default function DailyReviewScreen() {
  const ui = useThemedStyles();
  const { palette } = useTheme();
  const resource = useApi<PortfolioResponse>('/portfolio');
  const { initialized } = useAuth();
  const { world } = useGame();
  const [visitError, setVisitError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const review = resource.data?.dailyReview;
  const refresh = resource.refresh;
  const worldId = world?.id;
  const worldStatus = world?.status;

  useFocusEffect(useCallback(() => {
    if (!initialized || !worldId || worldStatus !== 'idle') return;
    let active = true;
    // real-day visits are counted by the server, separately from world days.
    api('/daily-review/view', { method: 'POST' }).then(async () => {
      if (active) { setVisitError(null); await refresh(); }
    }).catch(cause => { if (active) setVisitError(errorMessage(cause)); })
      .finally(() => { if (active) setRecording(false); });
    return () => { active = false; };
  }, [initialized, worldId, worldStatus, refresh]));

  async function retryVisit() {
    setRecording(true);
    try { await api('/daily-review/view', { method: 'POST' }); setVisitError(null); await refresh(); }
    catch (cause) { setVisitError(errorMessage(cause)); }
    finally { setRecording(false); }
  }

  return <AppShell>
    <PageTitle title="A moment of perspective." subtitle="Your daily portfolio check-in. Understand what you own, then decide what comes next." />
    <DailyQuiz />
    <DataState loading={resource.loading} error={resource.error} hasData={!!resource.data} retry={() => void refresh()}>
      {visitError && <Notice tone="error" action={<Button compact variant="secondary" loading={recording} onPress={() => void retryVisit()}>Retry check-in</Button>}>{visitError}</Notice>}
      <Card dark style={{ gap: 18, padding: 32 }}><Text style={{ color: palette.positiveOnDark, fontSize: 10, letterSpacing: 2, fontWeight: '700' }}>YOUR DAILY REVIEW</Text><Text accessibilityRole="header" style={{ fontSize: 31, fontWeight: '600', color: palette.onDark, letterSpacing: -0.8 }}>{review?.headline || 'Your next insight is on its way.'}</Text><Text style={{ color: palette.mutedOnDark, fontSize: 14, lineHeight: 24, maxWidth: 650 }}>A strong investor pays attention to both growth and risk. Take a moment to understand your latest portfolio.</Text><Badge tone="positive">Game day: {observationDate(review?.worldDate)}</Badge></Card>
      <View style={ui.metricGrid}><Metric label="PORTFOLIO VALUE" value={money(resource.data?.summary.valueILS)} detail="Your current virtual wealth" /><Metric label="WEEKLY RETURN" value={percent(resource.data?.summary.weeklyReturnPct, true)} detail="Growth since this week began" /><Metric label="MAXIMUM DRAWDOWN" value={percent(resource.data?.summary.mddPct)} detail="Your biggest weekly peak-to-trough fall" /></View>
      <Card style={{ gap: 12 }}><View style={[ui.row, { flexWrap: 'wrap', justifyContent: 'space-between' }]}><View style={{ gap: 5 }}><CardTitle>Orders waiting to execute</CardTitle><Copy muted>{review?.pendingOrders === undefined ? '—' : String(review.pendingOrders)} pending · Execution follows the shared game clock.</Copy></View><Link href="/orders" asChild><Button compact variant="secondary" onPress={() => undefined}>Review order status  →</Button></Link></View></Card>
      <View style={ui.split}>
        <Card style={{ flex: 1.4, minWidth: 270, gap: 19 }}><Eyebrow>A lesson from your portfolio</Eyebrow><CardTitle>See the bigger picture.</CardTitle><Copy style={{ fontSize: 18, lineHeight: 30 }}>{review?.insight || 'Your personal portfolio insight will appear after the data has loaded.'}</Copy><View style={ui.divider} /><Copy muted>Diversification means spreading exposure across different investments. A 20% purchase limit is a starting guardrail; it does not make a portfolio risk-free.</Copy><Link href="/market" asChild><Button variant="secondary" onPress={() => undefined}>Explore your next decision  →</Button></Link></Card>
        <Card style={{ flex: 1, minWidth: 260, gap: 18 }}><Eyebrow>Before your next move</Eyebrow><CardTitle>Patience is part of investing.</CardTitle><Copy muted>Check your cash, review your largest holdings and learn something new. A useful daily check-in does not have to end with a trade.</Copy><View style={ui.divider} /><Copy muted style={{ fontSize: 12 }}>You can reflect, learn and keep your current holdings.</Copy><Link href="/help" asChild><Button compact variant="secondary" onPress={() => undefined}>Review the rules  →</Button></Link></Card>
      </View>
    </DataState>
  </AppShell>;
}
