import { Link } from 'expo-router';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { AppShell } from '@/components/AppShell';
import { PortfolioPerformance } from '@/components/PortfolioPerformance';
import { Badge, Button, Card, CardTitle, Copy, DataState, Empty, Notice, PageTitle, useThemedStyles } from '@/components/ui/kit';
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
  const compact = useWindowDimensions().width < 1000;
  const portfolio = useApi<PortfolioResponse>('/portfolio');
  const market = useApi<MarketResponse>('/market');
  const { world, refreshing, refreshWorld } = useGame();
  const { user } = useAuth();
  const summary = portfolio.data?.summary;
  const holdings = summary?.holdings.filter(holding => Number(holding.units) > 0) || [];
  const name = playerDisplayName({ portfolioName: portfolio.data?.portfolio.displayName, accountName: user?.displayName, email: user?.email });

  return <AppShell>
    <PageTitle title="Portfolio" subtitle={`${name ? `${name} · ` : ''}Your virtual account, valued in shekels.`} action={<Button compact variant="secondary" loading={refreshing || portfolio.loading} onPress={() => void refreshWorld()}>Refresh</Button>} />
    <DataState loading={portfolio.loading} error={portfolio.error} hasData={!!portfolio.data} retry={() => void portfolio.refresh()}>
      <Card style={{ gap: 24, padding: compact ? 20 : 28 }}>
        <View style={{ gap: 8 }}><Copy muted style={{ fontSize: 12, fontWeight: '600' }}>TOTAL PORTFOLIO VALUE</Copy><Text style={{ color: palette.ink, fontSize: compact ? 38 : 46, fontWeight: '700', letterSpacing: -1, fontVariant: ['tabular-nums'] }}>{money(summary?.valueILS)}</Text><Copy muted style={{ fontSize: 12 }}>Total cash + current holdings value</Copy></View>
        <View style={{ flexDirection: compact ? 'column' : 'row', flexWrap: 'wrap', gap: compact ? 20 : 28 }}>
          <AccountFigure label="Available cash" value={money(summary?.availableCashILS)} hint="For new orders" compact={compact} />
          <AccountFigure label="Reserved cash" value={money(summary?.reservedCashILS)} hint="Waiting for pending buys" compact={compact} />
          <AccountFigure label="Holdings value" value={money(summary?.holdingsValueILS)} hint="Shares and funds you own" compact={compact} />
        </View>
        <View style={{ gap: 5 }}><Copy style={{ fontWeight: '600', fontSize: 13 }}>Total cash: {money(summary?.cashILS)} <Copy muted style={{ fontSize: 12 }}>({percent(summary?.cashWeightPct)} of portfolio)</Copy></Copy><Copy muted style={{ fontSize: 12 }}>Total cash includes available and reserved cash. A pending buy reserves money; it does not reduce your total portfolio value.</Copy></View>
      </Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24 }}>
        <View style={{ flex: 1, minWidth: 125, gap: 6 }}><Copy muted style={{ fontSize: 12 }}>Weekly return</Copy><Text style={{ fontSize: 28, fontWeight: '700', fontVariant: ['tabular-nums'], color: Number(summary?.weeklyReturnPct) < 0 ? palette.red : palette.green }}>{percent(summary?.weeklyReturnPct, true)}</Text><Copy muted style={{ fontSize: 12 }}>Since the weekly start</Copy></View>
        <View style={{ flex: 1, minWidth: 125, gap: 6 }}><Copy muted style={{ fontSize: 12 }}>Maximum drawdown</Copy><Text style={{ fontSize: 28, fontWeight: '700', fontVariant: ['tabular-nums'], color: palette.ink }}>{percent(summary?.mddPct)}</Text><Copy muted style={{ fontSize: 12 }}>Largest weekly peak-to-low fall</Copy></View>
      </View>
      {summary && !summary.eligible && <Notice>You joined after this week began. Trading is available; ranked competition begins next Monday.</Notice>}
      <Card style={{ gap: 18, padding: compact ? 20 : 24 }}>
        <View style={[ui.row, { justifyContent: 'space-between', flexWrap: 'wrap' }]}><CardTitle>Holdings</CardTitle><Badge>{holdings.length} positions</Badge></View>
        {!holdings.length ? <Empty title="No holdings yet." detail="Accepted buys appear here after execution. Pending orders and their reserved cash are visible in Orders." action={<Link href="/market" asChild><Button onPress={() => undefined}>Open Market</Button></Link>} /> : compact ? <View>
          {holdings.map((holding, index) => {
            const asset = market.data?.instruments.find(item => item.id === holding.instrumentId);
            return <View key={holding.instrumentId} style={{ paddingVertical: 16, gap: 9, borderTopWidth: index ? 1 : 0, borderColor: palette.tableLine }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}><View style={{ flex: 1, gap: 3 }}><Text style={{ color: palette.ink, fontSize: 17, fontWeight: '700' }}>{asset?.symbol || holding.instrumentId}</Text><Copy muted style={{ fontSize: 12 }}>{asset?.name || 'Holding'}</Copy></View><View style={{ alignItems: 'flex-end', gap: 3 }}><Text style={{ color: palette.ink, fontWeight: '700', fontSize: 19, fontVariant: ['tabular-nums'] }}>{money(holding.valueILS)}</Text><Copy muted style={{ fontSize: 12 }}>{percent(holding.weightPct)} of portfolio</Copy></View></View>
              <Copy muted style={{ fontSize: 12 }}>{number(holding.units, 6)} units · {money(holding.priceILS)} per unit</Copy>
              {Number(holding.reservedUnits) > 0 && <Copy muted style={{ fontSize: 12 }}>{number(holding.reservedUnits, 6)} units reserved for a pending sell</Copy>}
            </View>;
          })}
        </View> : <ScrollView horizontal><View style={{ minWidth: 850 }}>
          <View style={ui.tableHeader}>{['Asset', 'Units', 'Price (ILS)', 'Value (ILS)', 'Weight'].map((title, index) => <Text key={title} style={[ui.cell, ui.tableLabel, index === 0 && { flex: 1.6 }]}>{title}</Text>)}</View>
          {holdings.map(holding => {
            const asset = market.data?.instruments.find(item => item.id === holding.instrumentId);
            return <View key={holding.instrumentId} style={ui.tableRow}>
              <View style={{ flex: 1.6, minWidth: 130, gap: 4 }}><Text style={{ color: palette.ink, fontWeight: '700', fontSize: 14 }}>{asset?.symbol || holding.instrumentId}</Text><Copy muted style={{ fontSize: 12 }}>{asset?.name || 'Holding'}</Copy></View>
              <View style={ui.cell}><Copy>{number(holding.units, 6)}</Copy>{Number(holding.reservedUnits) > 0 && <Copy muted style={{ fontSize: 12 }}>{number(holding.reservedUnits, 6)} reserved</Copy>}</View>
              <Text style={ui.cell}>{money(holding.priceILS)}</Text><Text style={[ui.cell, { fontWeight: '600' }]}>{money(holding.valueILS)}</Text><Text style={ui.cell}>{percent(holding.weightPct)}</Text>
            </View>;
          })}
        </View></ScrollView>}
      </Card>
      <PortfolioPerformance />
      <View style={[ui.split, compact && { flexDirection: 'column' }]}>
        <View style={{ flex: 1, width: compact ? '100%' : undefined, gap: 10 }}><CardTitle>Portfolio insight</CardTitle><Copy muted>{portfolio.data?.insight || 'Review your available cash and positions before placing an order.'}</Copy><Link href="/news" asChild><Button compact variant="quiet" onPress={() => undefined}>News & daily question →</Button></Link></View>
        <View style={{ flex: 1, width: compact ? '100%' : undefined, gap: 10 }}><CardTitle>Weekly league</CardTitle><Copy muted>85% return ranking · 15% stability ranking. Compare your portfolio with the league over the same game week.</Copy><Link href="/leaderboard" asChild><Button compact variant="quiet" onPress={() => undefined}>Open league →</Button></Link></View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}><Copy muted style={{ fontSize: 12 }}>20% maximum per asset at purchase · No leverage · No short selling</Copy><Badge>{world?.source === 'historical' ? 'Real historical prices' : 'Simulated prices'}</Badge></View>
    </DataState>
  </AppShell>;
}

function AccountFigure({ label, value, hint, compact }: { label: string; value: string; hint: string; compact: boolean }) {
  const { palette } = useTheme();
  return <View style={{ flex: compact ? undefined : 1, minWidth: compact ? 0 : 180, flexDirection: compact ? 'row' : 'column', flexWrap: 'wrap', justifyContent: 'space-between', gap: compact ? 10 : 7, alignItems: compact ? 'center' : 'flex-start' }}><View style={{ gap: 3 }}><Copy style={{ fontWeight: '600', fontSize: 14 }}>{label}</Copy>{compact && <Copy muted style={{ fontSize: 11 }}>{hint}</Copy>}</View><Text style={{ color: palette.ink, fontSize: compact ? 23 : 29, fontWeight: '700', fontVariant: ['tabular-nums'], textAlign: compact ? 'right' : 'left' }}>{value}</Text>{!compact && <Copy muted style={{ fontSize: 12 }}>{hint}</Copy>}</View>;
}
