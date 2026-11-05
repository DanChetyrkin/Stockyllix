import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { api } from '@/api/client';
import { AppShell } from '@/components/AppShell';
import { DailyQuiz } from '@/components/DailyQuiz';
import { ProviderWidget } from '@/components/market/ProviderWidget';
import { newsMarkets, newsStocks, type NewsMarket } from '@/components/market/news-options';
import { Button, Card, CardTitle, Copy, Dialog, Field, PageTitle } from '@/components/ui/kit';
import { useGame } from '@/context/GameContext';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';

export default function NewsScreen() {
  const { world } = useGame();
  const { initialized } = useAuth();
  const { palette } = useTheme();
  const [market, setMarket] = useState<NewsMarket>('all');
  const [symbol, setSymbol] = useState('');
  const [choosing, setChoosing] = useState(false);
  const [query, setQuery] = useState('');
  const worldId = world?.id;
  const worldStatus = world?.status;
  const selected = newsStocks.find(([value]) => value === symbol);
  const stocks = newsStocks.filter(([value, label]) => `${value} ${label}`.toLowerCase().includes(query.toLowerCase()));
  useFocusEffect(
    useCallback(() => {
      if (!initialized || !worldId || worldStatus !== 'idle') return;
      // real-day return measurement is separate from the quiz's game date.
      void api('/daily-review/view', { method: 'POST' }).catch(() => {
        console.warn('Daily check-in measurement was not saved.');
      });
    }, [initialized, worldId, worldStatus]),
  );
  return (
    <AppShell>
      <PageTitle
        title="News"
        subtitle="Current headlines use real publication time. The daily question follows the game day."
      />
      <DailyQuiz compact />
      <Card style={{ gap: 12, padding: 16 }}>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="News market"
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}
        >
          {newsMarkets.map(item => (
            <Pressable
              key={item.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: !symbol && market === item.value }}
              onPress={() => {
                setMarket(item.value);
                setSymbol('');
              }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 10,
                minHeight: 40,
                borderRadius: 8,
                backgroundColor: !symbol && market === item.value ? palette.mint : palette.background,
              }}
            >
              <Text
                style={{
                  color: !symbol && market === item.value ? palette.green : palette.ink,
                  fontSize: 12,
                  fontWeight: '600',
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <Button compact variant="secondary" onPress={() => setChoosing(true)}>
            {selected ? `${selected[1]} · ${symbol.split(':')[1]}` : 'Choose a company'}
          </Button>
          {symbol && (
            <Button compact variant="quiet" onPress={() => setSymbol('')}>
              Clear company
            </Button>
          )}
          <Copy muted style={{ fontSize: 11, flex: 1, minWidth: 160 }}>
            Filters use the source’s markets and symbols. Some companies may have no stories.
          </Copy>
        </View>
        <ProviderWidget kind="news" newsMarket={market} newsSymbol={symbol} />
      </Card>
      <Dialog visible={choosing} onClose={() => setChoosing(false)} dismissLabel="Close company list">
        <Card style={{ width: '100%', maxWidth: 440, maxHeight: '85%', gap: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <CardTitle>Company news</CardTitle>
            <Button compact variant="quiet" onPress={() => setChoosing(false)}>
              Close
            </Button>
          </View>
          <Field label="Find a company" value={query} onChangeText={setQuery} placeholder="Name or symbol" />
          <ScrollView keyboardShouldPersistTaps="handled">
            {stocks.map(([value, label]) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                onPress={() => {
                  setSymbol(value);
                  setChoosing(false);
                }}
                style={{ paddingVertical: 13, borderBottomWidth: 1, borderColor: palette.line }}
              >
                <Text style={{ color: palette.ink, fontSize: 14 }}>{label}</Text>
                <Copy muted style={{ fontSize: 11 }}>
                  {value}
                </Copy>
              </Pressable>
            ))}
            {!stocks.length && <Copy muted>No matching company.</Copy>}
          </ScrollView>
        </Card>
      </Dialog>
    </AppShell>
  );
}
