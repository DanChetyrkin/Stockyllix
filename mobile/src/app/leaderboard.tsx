import { useState } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { LeaderboardResponse, type LeaderboardRow } from '@/api/types';
import { AppShell } from '@/components/AppShell';
import { Badge, Button, Card, Copy, DataState, Empty, Field, PageTitle, useThemedStyles } from '@/components/ui/kit';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useGame } from '@/context/GameContext';
import { useApi } from '@/hooks/use-api';
import { calendarDateAllowed } from '@/utils/calendar-date';
import { money, number, observationDate, percent } from '@/utils/format';

export default function LeaderboardScreen() {
  const { palette } = useTheme();
  const ui = useThemedStyles();
  const compact = useWindowDimensions().width < 1050;
  const { user } = useAuth();
  const { world } = useGame();
  const [page, setPage] = useState(1);
  const [weekInput, setWeekInput] = useState('');
  const [week, setWeek] = useState('');
  const resource = useApi<LeaderboardResponse>(
    `/leaderboard?page=${page}${week ? `&weekId=${encodeURIComponent(week)}` : ''}`,
  );
  const data = resource.data;

  return (
    <AppShell>
      <PageTitle
        title="League"
        subtitle="Weekly standings · 85% return ranking + 15% stability ranking."
        action={
          <Button compact variant="secondary" loading={resource.loading} onPress={() => void resource.refresh()}>
            Refresh
          </Button>
        }
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24 }}>
        <View style={{ flex: 1, minWidth: 150, gap: 6 }}>
          <Copy muted style={{ fontSize: 12 }}>
            Week beginning
          </Copy>
          <Text style={{ color: palette.ink, fontSize: 23, fontWeight: '700' }}>
            {observationDate(data?.weekId || world?.weekId)}
          </Text>
          <Copy muted style={{ fontSize: 12 }}>
            Monday through Friday
          </Copy>
        </View>
        <View style={{ flex: 1, minWidth: 100, gap: 6 }}>
          <Copy muted style={{ fontSize: 12 }}>
            Players
          </Copy>
          <Text style={{ color: palette.ink, fontSize: 23, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
            {data ? number(data.total, 0) : '—'}
          </Text>
          <Copy muted style={{ fontSize: 12 }}>
            In the selected week
          </Copy>
        </View>
      </View>
      <View style={{ gap: 12 }}>
        <View style={[ui.row, { alignItems: 'flex-end', flexWrap: 'wrap', gap: 10 }]}>
          <View style={{ flex: 1, minWidth: 200 }}>
            <Field
              label="Archived week (optional)"
              placeholder="Monday date: YYYY-MM-DD"
              value={weekInput}
              onChangeText={setWeekInput}
              autoCapitalize="none"
              maxLength={10}
            />
          </View>
          <Button
            compact
            variant="secondary"
            disabled={weekInput !== '' && !calendarDateAllowed(weekInput)}
            onPress={() => {
              setWeek(weekInput);
              setPage(1);
            }}
          >
            Show week
          </Button>
          <Button
            compact
            variant="quiet"
            onPress={() => {
              setWeekInput('');
              setWeek('');
              setPage(1);
            }}
          >
            Current week
          </Button>
        </View>
        <Copy muted style={{ fontSize: 12 }}>
          Use YYYY-MM-DD for a Monday. Equal results share a rank. Midweek joiners practice until the next weekly start.
        </Copy>
      </View>
      <DataState
        loading={resource.loading}
        error={resource.error}
        hasData={!!data}
        retry={() => void resource.refresh()}
      >
        <Card style={{ paddingHorizontal: compact ? 18 : 24, paddingVertical: 4 }}>
          {!data?.rows.length ? (
            <Empty
              title="No standings for this week yet."
              detail="Standings are published after the next game event. An archived week appears only after the clock reaches it."
            />
          ) : compact ? (
            <View>
              {data.rows.map((row, index) => (
                <View
                  key={row.uid}
                  style={{
                    padding: 16,
                    marginHorizontal: -8,
                    paddingVertical: 20,
                    gap: 14,
                    backgroundColor: row.uid === user?.uid ? palette.mint : undefined,
                    borderTopWidth: index ? 1 : 0,
                    borderColor: palette.tableLine,
                    borderRadius: row.uid === user?.uid ? 10 : 0,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                    <Text style={{ color: palette.green, fontSize: 21, fontWeight: '700', width: 32 }}>
                      {rankLabel(row)}
                    </Text>
                    <View style={{ flex: 1, gap: 5 }}>
                      <Text style={{ color: palette.ink, fontWeight: '600', fontSize: 15 }}>
                        {row.displayName}
                        {row.uid === user?.uid && ' (you)'}
                      </Text>
                      <Copy muted style={{ fontSize: 12 }}>
                        {money(row.valueILS)}
                      </Copy>
                      {!row.eligible && <Badge>Practice this week</Badge>}
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                    <View style={{ flex: 1, minWidth: 65, gap: 5 }}>
                      <Copy muted style={{ fontSize: 11 }}>
                        Weekly return
                      </Copy>
                      <Text
                        style={{
                          color: Number(row.weeklyReturnPct) < 0 ? palette.red : palette.green,
                          fontSize: 16,
                          fontWeight: '600',
                          fontVariant: ['tabular-nums'],
                        }}
                      >
                        {percent(row.weeklyReturnPct, true)}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 65, gap: 5 }}>
                      <Copy muted style={{ fontSize: 11 }}>
                        Drawdown
                      </Copy>
                      <Text style={{ color: palette.ink, fontSize: 16, fontVariant: ['tabular-nums'] }}>
                        {percent(row.mddPct)}
                      </Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 45, gap: 5 }}>
                      <Copy muted style={{ fontSize: 11 }}>
                        Score
                      </Copy>
                      <Text
                        style={{ color: palette.ink, fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] }}
                      >
                        {row.eligible ? number(row.score, 2) : '—'}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <ScrollView horizontal>
              <View style={{ minWidth: 950 }}>
                <View style={ui.tableHeader}>
                  {['Rank', 'Investor', 'Portfolio value', 'Weekly return', 'Max. drawdown', 'Score'].map(
                    (title, index) => (
                      <Text
                        key={title}
                        style={[
                          ui.cell,
                          ui.tableLabel,
                          index === 0 && { flex: 0.4, minWidth: 40 },
                          index === 1 && { flex: 1.4 },
                        ]}
                      >
                        {title}
                      </Text>
                    ),
                  )}
                </View>
                {data.rows.map(row => (
                  <View key={row.uid} style={[ui.tableRow, row.uid === user?.uid && { backgroundColor: palette.mint }]}>
                    <Text
                      style={[
                        ui.cell,
                        {
                          flex: 0.4,
                          minWidth: 40,
                          fontWeight: '700',
                          color: row.rank <= 3 ? palette.green : palette.muted,
                        },
                      ]}
                    >
                      {rankLabel(row)}
                    </Text>
                    <View style={{ flex: 1.4, minWidth: 130, gap: 6 }}>
                      <Text style={{ color: palette.ink, fontSize: 14, fontWeight: '600' }}>
                        {row.displayName}
                        {row.uid === user?.uid && ' (you)'}
                      </Text>
                      {!row.eligible && <Badge>Practice this week</Badge>}
                    </View>
                    <Text style={ui.cell}>{money(row.valueILS)}</Text>
                    <View style={{ flex: 1, minWidth: 80, gap: 5 }}>
                      <Text
                        style={{
                          fontSize: 14,
                          color: Number(row.weeklyReturnPct) < 0 ? palette.red : palette.green,
                          fontWeight: '600',
                        }}
                      >
                        {percent(row.weeklyReturnPct, true)}
                      </Text>
                      {row.eligible && (
                        <Copy muted style={{ fontSize: 11 }}>
                          Percentile {number(row.returnPercentile, 2)}
                        </Copy>
                      )}
                    </View>
                    <View style={{ flex: 1, minWidth: 80, gap: 5 }}>
                      <Text style={{ fontSize: 14, color: palette.ink }}>{percent(row.mddPct)}</Text>
                      {row.eligible && (
                        <Copy muted style={{ fontSize: 11 }}>
                          Percentile {number(row.stabilityPercentile, 2)}
                        </Copy>
                      )}
                    </View>
                    <Text style={[ui.cell, { fontSize: 18, fontWeight: '700' }]}>
                      {row.eligible ? number(row.score, 2) : '—'}
                    </Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </Card>
        <View style={[ui.row, { justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }]}>
          <Copy muted style={{ fontSize: 12 }}>
            A score of 100 is a ranking, not a 100% return.
          </Copy>
          <View style={[ui.row, { flexWrap: 'wrap', gap: 8 }]}>
            <Button compact variant="secondary" disabled={page <= 1} onPress={() => setPage(value => value - 1)}>
              ← Previous
            </Button>
            <Copy muted>Page {page}</Copy>
            <Button
              compact
              variant="secondary"
              disabled={!data || page * data.pageSize >= data.total}
              onPress={() => setPage(value => value + 1)}
            >
              Next →
            </Button>
          </View>
        </View>
      </DataState>
    </AppShell>
  );
}

// players who joined mid-week practise without a rank until the next week.
function rankLabel(row: LeaderboardRow) {
  return row.eligible ? String(row.rank).padStart(2, '0') : '—';
}
