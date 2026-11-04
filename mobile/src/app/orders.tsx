import { useState } from 'react';
import { Link } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { AppShell } from '@/components/AppShell';
import { Badge, Button, Card, Copy, DataState, Empty, PageTitle, useThemedStyles } from '@/components/ui/kit';
import { useTheme } from '@/context/ThemeContext';
import { useApi } from '@/hooks/use-api';
import { MarketResponse, Order } from '@/api/types';
import { dateTime, money, number } from '@/utils/format';

interface OrdersResponse { orders: Order[]; hasMore: boolean; nextBeforeSequence: number | null }

export default function OrdersScreen() {
  const { palette } = useTheme();
  const ui = useThemedStyles();
  const [before, setBefore] = useState<number | null>(null);
  const resource = useApi<OrdersResponse>(`/orders${before === null ? '' : `?beforeSequence=${before}`}`);
  const market = useApi<MarketResponse>('/market');
  const [filter, setFilter] = useState('all');
  const orders = (resource.data?.orders || []).filter(order => filter === 'all' || order.status === filter);

  return <AppShell>
    <PageTitle title="Every decision, recorded." subtitle="Follow each order from submission to execution. Submitted orders cannot be cancelled." action={<Link href="/market" asChild><Button compact onPress={() => undefined}>New order  +</Button></Link>} />
    <DataState loading={resource.loading} error={resource.error} hasData={!!resource.data} retry={() => void resource.refresh()}>
      <View style={[ui.row, { flexWrap: 'wrap' }]}>{['all', 'pending', 'executed', 'rejected'].map(status => <Button compact key={status} variant={filter === status ? 'primary' : 'secondary'} onPress={() => setFilter(status)}>{status[0].toUpperCase() + status.slice(1)}</Button>)}</View>
      <Card style={{ paddingHorizontal: 20 }}>
        {!orders.length ? <Empty title={filter === 'all' ? 'No orders on this page yet.' : `No ${filter} orders on this page.`} detail="When you place an order, its execution time and outcome will appear here." /> : <ScrollView horizontal><View style={{ minWidth: 900 }}>
          <View style={ui.tableHeader}>{['Asset / side', 'Amount', 'Submitted', 'Execution time', 'Status / execution'].map((title, index) => <Text key={title} style={[ui.cell, ui.tableLabel, index === 0 && { flex: 1.4 }, index === 4 && { flex: 1.6 }]}>{title}</Text>)}</View>
          {orders.map(order => <View key={order.id} style={[ui.tableRow, { alignItems: 'flex-start' }]}>
            <View style={{ flex: 1.4, minWidth: 130, gap: 7 }}><Text style={{ color: palette.ink, fontWeight: '700' }}>{market.data?.instruments.find(item => item.id === order.instrumentId)?.symbol || order.instrumentId}</Text><Badge tone={order.side === 'buy' ? 'positive' : 'neutral'}>{order.side}</Badge></View>
            <Text style={[ui.cell, { fontWeight: '600' }]}>{money(order.amountAgorot / 100)}</Text><Text style={ui.cell}>{dateTime(order.submittedAt)}</Text><Text style={ui.cell}>{dateTime(order.fill?.executedAt || order.executeAt)}</Text>
            <View style={{ flex: 1.6, minWidth: 160, gap: 7 }}><Badge tone={order.status === 'executed' ? 'positive' : order.status === 'rejected' ? 'negative' : 'neutral'}>{order.status}</Badge>{order.fill && <Copy muted style={{ fontSize: 11 }}>{number(order.fill.units, 6)} units @ {order.currency === 'USD' ? '$' : order.currency === 'ILS' ? '₪' : ''}{number(order.fill.price, 4)}{order.currency === 'USD' && `\nUSD / ILS: ${number(order.fill.fx, 6)}`}</Copy>}{order.rejection && <Copy style={{ color: palette.red, fontSize: 11 }}>{order.rejection.message}</Copy>}{order.status === 'pending' && <Copy muted style={{ fontSize: 11 }}>Waiting for the scheduled market event.</Copy>}</View>
          </View>)}
        </View></ScrollView>}
      </Card>
      <View style={[ui.row, { justifyContent: 'space-between' }]}><Copy muted style={{ fontSize: 12 }}>Latest 25 orders per page. Times use Israel time.</Copy><View style={ui.row}>{before !== null && <Button compact variant="secondary" onPress={() => setBefore(null)}>Latest orders</Button>}{resource.data?.hasMore && <Button compact variant="secondary" onPress={() => setBefore(resource.data?.nextBeforeSequence ?? null)}>Older orders →</Button>}</View></View>
    </DataState>
  </AppShell>;
}
