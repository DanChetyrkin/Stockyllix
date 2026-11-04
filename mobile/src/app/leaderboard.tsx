import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { LeaderboardResponse } from '@/api/types';
import { AppShell } from '@/components/AppShell';
import { Badge, Button, Card, Copy, DataState, Empty, Field, Metric, PageTitle, useThemedStyles } from '@/components/ui/kit';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useGame } from '@/context/GameContext';
import { useApi } from '@/hooks/use-api';
import { money, number, observationDate, percent } from '@/utils/format';

export default function LeaderboardScreen() {
  const { palette } = useTheme();
  const ui = useThemedStyles();
  const { user } = useAuth();
  const { world } = useGame();
  const [page, setPage] = useState(1);
  const [weekInput, setWeekInput] = useState('');
  const [week, setWeek] = useState('');
  const resource = useApi<LeaderboardResponse>(`/leaderboard?page=${page}${week ? `&weekId=${encodeURIComponent(week)}` : ''}`);
  const data = resource.data;

  return <AppShell>
    <PageTitle title="Better, together." subtitle="The portfolio league rewards growth and stability. Find your place and learn from the journey." />
    <View style={ui.metricGrid}><Metric dark label="THE WEEKLY SCORE" value="85 / 15" detail="Return ranking / stability ranking" /><Metric label="WEEK BEGINNING" value={observationDate(data?.weekId || world?.weekId)} detail="Monday through Friday" /><Metric label="PLAYERS" value={data ? number(data.total, 0) : '—'} detail="In the league this week" /></View>
    <Card style={{ gap: 16 }}><View style={[ui.row, { alignItems: 'flex-end', flexWrap: 'wrap' }]}><View style={{ flex: 1, minWidth: 200 }}><Field label="Archived week (optional)" placeholder="Monday date: YYYY-MM-DD" value={weekInput} onChangeText={setWeekInput} autoCapitalize="none" maxLength={10} /></View><Button compact variant="secondary" disabled={weekInput !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(weekInput)} onPress={() => { setWeek(weekInput); setPage(1); }}>Show week</Button><Button compact variant="quiet" onPress={() => { setWeekInput(''); setWeek(''); setPage(1); }}>Current week</Button></View><Copy muted style={{ fontSize: 11 }}>Equal results share a rank. Players who joined midweek practice until the next weekly start.</Copy></Card>
    <DataState loading={resource.loading} error={resource.error} hasData={!!data} retry={() => void resource.refresh()}>
      <Card style={{ paddingHorizontal: 20 }}>
        {!data?.rows.length ? <Empty title="The league is warming up." detail="A leaderboard is published after the world clock processes its next event. An archived week only appears once it has been reached." /> : <ScrollView horizontal><View style={{ minWidth: 950 }}>
          <View style={ui.tableHeader}>{['Rank', 'Investor', 'Portfolio value', 'Weekly return', 'Max. drawdown', 'Score'].map((title, index) => <Text key={title} style={[ui.cell, ui.tableLabel, index === 0 && { flex: 0.4, minWidth: 40 }, index === 1 && { flex: 1.4 }]}>{title}</Text>)}</View>
          {data.rows.map(row => <View key={row.uid} style={[ui.tableRow, row.uid === user?.uid && { backgroundColor: palette.mint }]}>
            <Text style={[ui.cell, { flex: 0.4, minWidth: 40, fontWeight: '700', color: row.rank <= 3 ? palette.green : palette.muted }]}>{row.eligible ? String(row.rank).padStart(2, '0') : '—'}</Text>
            <View style={{ flex: 1.4, minWidth: 130, gap: 6 }}><Text style={{ color: palette.ink, fontSize: 13, fontWeight: '600' }}>{row.displayName}{row.uid === user?.uid ? ' (you)' : ''}</Text>{!row.eligible && <Badge>Practice this week</Badge>}</View>
            <Text style={ui.cell}>{money(row.valueILS)}</Text><View style={{ flex: 1, minWidth: 80, gap: 5 }}><Text style={{ fontSize: 13, color: Number(row.weeklyReturnPct) < 0 ? palette.red : palette.green, fontWeight: '600' }}>{percent(row.weeklyReturnPct, true)}</Text>{row.eligible && <Copy muted style={{ fontSize: 9, lineHeight: 15 }}>Percentile {number(row.returnPercentile, 2)}</Copy>}</View><View style={{ flex: 1, minWidth: 80, gap: 5 }}><Text style={{ fontSize: 13, color: palette.ink }}>{percent(row.mddPct)}</Text>{row.eligible && <Copy muted style={{ fontSize: 9, lineHeight: 15 }}>Percentile {number(row.stabilityPercentile, 2)}</Copy>}</View><Text style={[ui.cell, { fontSize: 17, fontWeight: '700' }]}>{row.eligible ? number(row.score, 2) : '—'}</Text>
          </View>)}
        </View></ScrollView>}
      </Card>
      <View style={[ui.row, { justifyContent: 'space-between', flexWrap: 'wrap' }]}><Copy muted style={{ fontSize: 11 }}>Score = 0.85 × return percentile + 0.15 × stability percentile</Copy><View style={ui.row}><Button compact variant="secondary" disabled={page <= 1} onPress={() => setPage(value => value - 1)}>← Previous</Button><Copy muted>Page {page}</Copy><Button compact variant="secondary" disabled={!data || page * data.pageSize >= data.total} onPress={() => setPage(value => value + 1)}>Next →</Button></View></View>
    </DataState>
  </AppShell>;
}
