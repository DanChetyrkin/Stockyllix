import { useState } from 'react';
import { Link } from 'expo-router';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { AppShell } from '@/components/AppShell';
import { Badge, Button, Card, Copy, DataState, Empty, PageTitle, useThemedStyles } from '@/components/ui/kit';
import { useTheme } from '@/context/ThemeContext';
import { useGame } from '@/context/GameContext';
import { useApi } from '@/hooks/use-api';
import { Order } from '@/api/types';
import { assetPrice, dateTime, money, number } from '@/utils/format';

interface OrdersResponse { orders: Order[]; hasMore: boolean; nextBeforeSequence: number | null }

export default function OrdersScreen() {
  const { palette } = useTheme();
  const ui = useThemedStyles();
  const compact = useWindowDimensions().width < 1000;
  const { world, refreshing, refreshWorld } = useGame();
  const [before, setBefore] = useState<number | null>(null);
  const resource = useApi<OrdersResponse>(`/orders${before === null ? '' : `?beforeSequence=${before}`}`);
  const [filter, setFilter] = useState('all');
  const orders = (resource.data?.orders || []).filter(order => filter === 'all' || order.status === filter);

  return <AppShell>
    <PageTitle title="Orders" subtitle="Pending orders reserve funds. Only executed orders change your holdings." action={<View style={[ui.row, { flexWrap: 'wrap', gap: 8 }]}><Button compact variant="secondary" loading={refreshing || resource.loading} onPress={() => void refreshWorld()}>Refresh</Button><Link href="/market" asChild><Button compact onPress={() => undefined}>New order</Button></Link></View>} />
    <DataState loading={resource.loading} error={resource.error} hasData={!!resource.data} retry={() => void resource.refresh()}>
      <View style={[ui.row, { flexWrap: 'wrap', gap: 8 }]}>{['all', 'pending', 'executed', 'rejected'].map(status => <Button compact key={status} variant={filter === status ? 'primary' : 'secondary'} onPress={() => setFilter(status)}>{status[0].toUpperCase() + status.slice(1)}</Button>)}</View>
      {world?.status === 'advancing' && <Copy muted>Synchronizing game time. Order statuses refresh after processing finishes.</Copy>}
      <Card style={{ paddingHorizontal: compact ? 18 : 24, paddingVertical: 4 }}>
        {!orders.length ? <Empty title={filter === 'all' ? 'No orders on this page.' : `No ${filter} orders on this page.`} detail="Place an order in Market. Its status and scheduled execution time will appear here." /> : compact ? <View>
          {orders.map((order, index) => <View key={order.id} style={{ paddingVertical: 20, gap: 14, borderTopWidth: index ? 1 : 0, borderColor: palette.tableLine }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flex: 1, gap: 5 }}><Text style={{ color: palette.ink, fontSize: 18, fontWeight: '700' }}>{symbol(order)}</Text><Copy muted style={{ fontSize: 12 }}>{order.side === 'buy' ? 'Buy' : 'Sell'}</Copy></View>
              <Text style={{ color: palette.ink, fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'], textAlign: 'right', flexShrink: 1 }}>{money(order.amountAgorot / 100)}</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <OrderBadge order={order} />
              <View style={{ gap: 3, alignItems: 'flex-end' }}><Copy muted style={{ fontSize: 11 }}>{order.fill ? 'Executed at' : 'Expected execution'}</Copy><Text style={{ color: palette.ink, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{dateTime(order.fill?.executedAt || order.executeAt)}</Text><Copy muted style={{ fontSize: 11 }}>Game time · Israel</Copy></View>
            </View>
            <OrderOutcome order={order} />
            <Copy muted style={{ fontSize: 11 }}>Submitted {dateTime(order.submittedAt)} · Israel time</Copy>
          </View>)}
        </View> : <ScrollView horizontal><View style={{ minWidth: 900 }}>
          <View style={ui.tableHeader}>{['Asset / side', 'Amount', 'Submitted', 'Execution time', 'Status / execution'].map((title, index) => <Text key={title} style={[ui.cell, ui.tableLabel, index === 0 && { flex: 1.4 }, index === 4 && { flex: 1.6 }]}>{title}</Text>)}</View>
          {orders.map(order => <View key={order.id} style={[ui.tableRow, { alignItems: 'flex-start' }]}>
            <View style={{ flex: 1.4, minWidth: 130, gap: 7 }}><Text style={{ color: palette.ink, fontWeight: '700' }}>{symbol(order)}</Text><Copy muted style={{ fontSize: 12 }}>{order.side === 'buy' ? 'Buy' : 'Sell'}</Copy></View>
            <Text style={[ui.cell, { fontWeight: '600' }]}>{money(order.amountAgorot / 100)}</Text><Text style={ui.cell}>{dateTime(order.submittedAt)}</Text><Text style={ui.cell}>{dateTime(order.fill?.executedAt || order.executeAt)}</Text>
            <View style={{ flex: 1.6, minWidth: 160, gap: 8 }}><OrderBadge order={order} /><OrderOutcome order={order} /></View>
          </View>)}
        </View></ScrollView>}
      </Card>
      <View style={[ui.row, { justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }]}><Copy muted style={{ fontSize: 12 }}>Latest 25 orders per page · Times use the game clock in Israel · Sent orders cannot be cancelled.</Copy><View style={[ui.row, { flexWrap: 'wrap', gap: 8 }]}>{before !== null && <Button compact variant="secondary" onPress={() => setBefore(null)}>Latest orders</Button>}{resource.data?.hasMore && <Button compact variant="secondary" onPress={() => setBefore(resource.data?.nextBeforeSequence ?? null)}>Older orders →</Button>}</View></View>
    </DataState>
  </AppShell>;
}

function symbol(order: Order) { return order.instrumentId.replace(/\.TA$/, ''); }

function OrderBadge({ order }: { order: Order }) {
  return <Badge tone={order.status === 'executed' ? 'positive' : order.status === 'rejected' ? 'negative' : 'neutral'}>{order.status === 'pending' ? 'Pending execution' : order.status}</Badge>;
}

function OrderOutcome({ order }: { order: Order }) {
  const { palette } = useTheme();
  if (order.rejection) return <Copy style={{ color: palette.red, fontSize: 12 }}>{order.rejection.message} Review the reason before placing another order.</Copy>;
  if (order.fill) return <Copy muted style={{ fontSize: 12 }}>{order.side === 'buy' ? 'Bought' : 'Sold'} {number(order.fill.units, 6)} units at {assetPrice(order.fill.price, order.currency, 4)}{order.currency === 'USD' ? ` · USD / ILS ${number(order.fill.fx, 6)}` : ''}</Copy>;
  return <Copy muted style={{ fontSize: 12 }}>{order.side === 'buy' ? `${money(order.amountAgorot / 100)} is reserved, not spent. Your available cash is lower while this order waits.` : 'Your existing units are reserved while this order waits.'} Execution uses the shared game clock.</Copy>;
}
