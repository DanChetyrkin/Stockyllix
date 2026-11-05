import { useState } from 'react';
import { Text, View } from 'react-native';
import { useApi } from '@/hooks/use-api';
import { Button, CardTitle, Copy, DataState, Metric, useThemedStyles } from './ui/kit';
import { dateTime, money, number, percent } from '@/utils/format';

interface Performance {
  from: string;
  asOf: string;
  dataMode: string;
  realizedILS: string;
  unrealizedILS: string;
  totalProfitILS: string;
  periodReturnPct: string;
  benchmarkReturnPct: string | null;
  excessReturnPct: string | null;
  holdings: { instrumentId: string; costILS: string; unrealizedILS: string }[];
}

export function PortfolioPerformance() {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 16 }}>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <CardTitle>Performance</CardTitle>
        <Button compact variant="secondary" onPress={() => setOpen(value => !value)}>
          {open ? 'Hide report' : 'Show report'}
        </Button>
      </View>
      <Copy muted>Realized and unrealized profit, with a SPY comparison over the same game period.</Copy>
      {open && <PerformanceReport />}
    </View>
  );
}

function PerformanceReport() {
  const report = useApi<Performance>('/performance');
  const ui = useThemedStyles();
  const data = report.data;
  return (
    <DataState loading={report.loading} error={report.error} hasData={!!data} retry={() => void report.refresh()}>
      {data && (
        <>
          <View style={ui.metricGrid}>
            <Metric
              label="REALIZED P/L"
              value={money(data.realizedILS)}
              detail="Closed units · weighted average ILS cost"
              tone={Number(data.realizedILS) < 0 ? 'negative' : 'positive'}
            />
            <Metric
              label="UNREALIZED P/L"
              value={money(data.unrealizedILS)}
              detail="Current holdings minus remaining ILS cost"
              tone={Number(data.unrealizedILS) < 0 ? 'negative' : 'positive'}
            />
            <Metric
              label="RETURN SINCE JOINING"
              value={percent(data.periodReturnPct, true)}
              detail={`${dateTime(data.from)} → ${dateTime(data.asOf)}`}
            />
            <Metric
              label={data.dataMode === 'simulated' ? 'SIMULATED SPY RETURN' : 'SPY PERIOD RETURN'}
              value={percent(data.benchmarkReturnPct ?? undefined, true)}
              detail={
                data.excessReturnPct === null
                  ? 'SPY is unavailable in this dataset'
                  : `${Number(data.excessReturnPct) > 0 ? '+' : ''}${number(data.excessReturnPct)} percentage points relative to SPY, in ILS`
              }
            />
          </View>
          {data.holdings.length > 0 && (
            <View style={{ gap: 12 }}>
              <Copy style={{ fontWeight: '600' }}>Cost and open profit by position</Copy>
              {data.holdings.map(holding => (
                <View
                  key={holding.instrumentId}
                  style={[ui.row, { flexWrap: 'wrap', justifyContent: 'space-between' }]}
                >
                  <Text style={ui.cell}>{holding.instrumentId}</Text>
                  <Copy muted>Cost {money(holding.costILS)}</Copy>
                  <Copy>Open P/L {money(holding.unrealizedILS)}</Copy>
                </View>
              ))}
            </View>
          )}
          <Copy muted style={{ fontSize: 12 }}>
            The benchmark holds SPY throughout the same world period and includes USD/ILS changes. This is a period
            comparison, not an annual return. No fees or dividends are included.
          </Copy>
        </>
      )}
    </DataState>
  );
}
