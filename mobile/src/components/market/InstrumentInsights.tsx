import { Text, View } from 'react-native';
import type { Instrument } from '@/api/types';
import { Badge, Card, Copy, DataState, useThemedStyles } from '@/components/ui/kit';
import { useTheme } from '@/context/ThemeContext';
import { useApi } from '@/hooks/use-api';
import { dateTime, number } from '@/utils/format';
import { PriceChart } from './PriceChart';
import type { PriceHistory } from './types';

export function InstrumentInsights({ instrument }: { instrument: Instrument }) {
  const { palette } = useTheme();
  const ui = useThemedStyles();
  const history = useApi<PriceHistory>(`/instruments/${encodeURIComponent(instrument.id)}/history`);
  const dailyChange = history.data?.dailyChangePct != null ? Number(history.data.dailyChangePct) : null;
  const latestPrice = history.data?.latestPrice ?? instrument.price;
  return <Card style={{ gap: 18 }}>
    <View style={[ui.row, { flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start' }]}>
      <View style={{ gap: 5 }}><Text accessibilityRole="header" style={{ color: palette.ink, fontSize: 21, fontWeight: '700' }}>{instrument.symbol}</Text><Copy muted>{instrument.name}</Copy><Copy muted style={{ fontSize: 11 }}>{instrument.sector} · {instrument.currency} · {instrument.market === 'TA' ? 'Tel Aviv' : 'United States'}</Copy></View>
      <View style={{ gap: 5, alignItems: 'flex-end' }}><Text style={{ color: palette.ink, fontSize: 24, fontWeight: '700' }}>{instrument.currency === 'USD' ? '$' : '₪'}{number(latestPrice)}</Text>{dailyChange !== null && <Badge tone={dailyChange >= 0 ? 'positive' : 'negative'}>Daily price change {dailyChange > 0 ? '+' : ''}{dailyChange.toFixed(2)}%</Badge>}</View>
    </View>
    <DataState loading={history.loading} error={history.error} hasData={!!history.data} retry={() => void history.refresh()}>
      {history.data && <><Badge tone="neutral">{history.data.dataMode === 'simulated' ? 'Simulation history' : 'Historical replay'} · Opening & closing prices</Badge><PriceChart points={history.data.points} currency={instrument.currency} symbol={instrument.symbol} /><Copy muted style={{ fontSize: 10 }}>Known observations through {dateTime(history.data.asOf)} · Israel time</Copy><Copy muted style={{ fontSize: 11 }}>{history.data.previousCloseAt ? `Daily price change in ${instrument.currency} vs the prior session close (${dateTime(history.data.previousCloseAt)}, Israel time).` : 'Daily price change is available once a prior session close is known.'}</Copy></>}
    </DataState>
  </Card>;
}
