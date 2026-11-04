import { Link } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { AppShell } from '@/components/AppShell';
import { PortfolioPerformance } from '@/components/PortfolioPerformance';
import { Badge, Button, Card, CardTitle, Copy, DataState, Empty, Eyebrow, Metric, Notice, PageTitle, useThemedStyles } from '@/components/ui/kit';
import { useTheme } from '@/context/ThemeContext';
import { useApi } from '@/hooks/use-api';
import { MarketResponse, PortfolioResponse } from '@/api/types';
import { useGame } from '@/context/GameContext';
import { useAuth } from '@/context/AuthContext';
import { money, number, percent } from '@/utils/format';
import { playerDisplayName } from '@/utils/player-name';

export default function PortfolioScreen() {
  const { palette } = useTheme();
  const ui = useThemedStyles();
  const portfolio = useApi<PortfolioResponse>('/portfolio');
  const market = useApi<MarketResponse>('/market');
  const { world, refreshing, refreshWorld } = useGame();
  const { user } = useAuth();
  const summary = portfolio.data?.summary;
  const holdings = summary?.holdings.filter(holding => Number(holding.units) > 0) || [];
  const name = playerDisplayName({ portfolioName: portfolio.data?.portfolio.displayName, accountName: user?.displayName, email: user?.email });

  return <AppShell>
    <PageTitle title={name ? `Your portfolio, ${name}.` : 'Your portfolio.'} subtitle="A clear view of your money. A little more confidence with every decision." action={<Button compact variant="secondary" loading={refreshing} onPress={() => void refreshWorld()}>↻  Refresh</Button>} />
    <Copy muted style={{ fontSize: 12 }}>You can change your name and photo from your profile in the top-right corner.</Copy>
    <DataState loading={portfolio.loading} error={portfolio.error} hasData={!!portfolio.data} retry={() => void portfolio.refresh()}>
      <View style={ui.metricGrid}>
        <Metric dark label="TOTAL PORTFOLIO VALUE" value={money(summary?.valueILS)} detail="Cash + holdings, valued in shekels" />
        <Metric label="WEEKLY RETURN" value={percent(summary?.weeklyReturnPct, true)} tone={Number(summary?.weeklyReturnPct) < 0 ? 'negative' : 'positive'} detail="Since the start of this competition week" />
        <Metric label="CASH" value={money(summary?.cashILS)} detail={`${percent(summary?.cashWeightPct)} of portfolio\n${money(summary?.availableCashILS)} available · ${money(summary?.reservedCashILS)} reserved`} />
        <Metric label="MAXIMUM DRAWDOWN" value={percent(summary?.mddPct)} detail="Largest fall from a previous weekly peak" />
      </View>
      <PortfolioPerformance />
      {summary && !summary.eligible && <Notice tone="neutral">You joined after this week began. Practice trading now; you will join the ranked competition next Monday.</Notice>}
      <View style={ui.split}>
        <Card style={{ flex: 2, minWidth: 280, gap: 20 }}>
          <View style={[ui.row, { justifyContent: 'space-between', flexWrap: 'wrap' }]}><View style={{ gap: 5 }}><CardTitle>Your holdings</CardTitle><Copy muted style={{ fontSize: 12 }}>Every position, in one place.</Copy></View><Badge>{holdings.length} positions</Badge></View>
          {!holdings.length ? <Empty title="Your next chapter is open." detail="You start with one million virtual shekels. Explore the markets and make your first considered investment." action={<Link href="/market" asChild><Button onPress={() => undefined}>Explore the markets  →</Button></Link>} /> : <ScrollView horizontal><View style={{ minWidth: 660 }}>
            <View style={ui.tableHeader}>{['Asset', 'Units', 'Price (ILS)', 'Value (ILS)', 'Weight'].map((title, index) => <Text key={title} style={[ui.cell, ui.tableLabel, index === 0 && { flex: 1.6 }]}>{title}</Text>)}</View>
            {holdings.map(holding => {
              const asset = market.data?.instruments.find(item => item.id === holding.instrumentId);
              return <View key={holding.instrumentId} style={ui.tableRow}>
                <View style={{ flex: 1.6, minWidth: 130, gap: 4 }}><Text style={{ color: palette.ink, fontWeight: '700', fontSize: 13 }}>{asset?.symbol || holding.instrumentId}</Text><Copy muted style={{ fontSize: 10 }}>{asset?.name || 'Holding'}</Copy></View>
                <View style={ui.cell}><Copy style={{ fontSize: 13 }}>{number(holding.units, 6)}</Copy>{Number(holding.reservedUnits) > 0 && <Copy muted style={{ fontSize: 10 }}>{number(holding.reservedUnits, 6)} reserved</Copy>}</View>
                <Text style={ui.cell}>{money(holding.priceILS)}</Text><Text style={[ui.cell, { fontWeight: '600' }]}>{money(holding.valueILS)}</Text><Text style={ui.cell}>{percent(holding.weightPct)}</Text>
              </View>;
            })}
          </View></ScrollView>}
        </Card>
        <View style={{ flex: 1, minWidth: 260, gap: 20 }}>
          <Card style={{ gap: 18 }}><Eyebrow>Make it a daily habit</Eyebrow><CardTitle>A moment to reflect.</CardTitle><Copy muted>Your personal review connects your portfolio with a practical investing lesson.</Copy><Link href="/daily-review" asChild><Button variant="secondary" onPress={() => undefined}>Open your daily review  →</Button></Link></Card>
          <Card style={{ gap: 16 }}><Eyebrow>The weekly league</Eyebrow><View style={{ flexDirection: 'row', gap: 14 }}><View style={{ flex: 1, gap: 5 }}><Text style={{ fontSize: 27, color: palette.green, fontWeight: '700' }}>85%</Text><Copy muted style={{ fontSize: 11 }}>Return ranking</Copy></View><View style={{ flex: 1, gap: 5 }}><Text style={{ fontSize: 27, color: palette.ink, fontWeight: '700' }}>15%</Text><Copy muted style={{ fontSize: 11 }}>Stability ranking</Copy></View></View><View style={ui.divider} /><Copy muted style={{ fontSize: 12 }}>Your score combines return and maximum drawdown percentiles. Higher is better.</Copy><Link href="/leaderboard" asChild><Button compact variant="quiet" onPress={() => undefined}>See the league  →</Button></Link></Card>
        </View>
      </View>
      <Card style={{ paddingVertical: 18, flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}><View style={{ gap: 4 }}><Copy style={{ fontWeight: '600' }}>Thoughtful investing has boundaries.</Copy><Copy muted style={{ fontSize: 12 }}>20% maximum per asset at purchase · No leverage · No short selling</Copy></View><Badge tone={world?.source === 'historical' ? 'positive' : 'warning'}>{world?.source === 'historical' ? 'Historical world' : 'Simulation world'}</Badge></Card>
    </DataState>
  </AppShell>;
}
