import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import type { NewsResponse } from '@/api/feeds';
import { api } from '@/api/client';
import { AppShell } from '@/components/AppShell';
import { DailyQuiz } from '@/components/DailyQuiz';
import { ProviderWidget } from '@/components/market/ProviderWidget';
import { newsMarkets, newsStocks, type NewsMarket } from '@/components/market/news-options';
import { Button, Card, CardTitle, Copy, Empty, Field, Notice } from '@/components/ui/kit';
import { useGame } from '@/context/GameContext';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useFeed } from '@/hooks/use-feed';
import { dateTime } from '@/utils/format';

export default function NewsScreen() {
  const { isAdmin, world } = useGame();
  const { initialized } = useAuth();
  const { palette } = useTheme();
  const [preview, setPreview] = useState(false);
  const [market, setMarket] = useState<NewsMarket>('all');
  const [symbol, setSymbol] = useState('');
  const [choosing, setChoosing] = useState(false);
  const [query, setQuery] = useState('');
  const worldId = world?.id;
  const worldStatus = world?.status;
  const selected = newsStocks.find(([value]) => value === symbol);
  const stocks = newsStocks.filter(([value, label]) => `${value} ${label}`.toLowerCase().includes(query.toLowerCase()));
  useFocusEffect(useCallback(() => {
    if (!initialized || !worldId || worldStatus !== 'idle') return;
    // real-day return measurement is separate from the quiz's game date.
    void api('/daily-review/view', { method: 'POST' }).catch(() => {
      console.warn('Daily check-in measurement was not saved.');
    });
  }, [initialized, worldId, worldStatus]));
  return <AppShell>
    <View style={{ gap: 4 }}><Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: '700', color: palette.ink }}>News & a daily question</Text><Copy muted style={{ fontSize: 12 }}>Current headlines · Real publication time, separate from the game clock.</Copy></View>
    <DailyQuiz compact />
    <Card style={{ gap: 12, padding: 16 }}>
      <View accessibilityRole="radiogroup" accessibilityLabel="News market" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{newsMarkets.map(item => <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{ checked: !symbol && market === item.value }} onPress={() => { setMarket(item.value); setSymbol(''); }} style={{ paddingHorizontal: 12, paddingVertical: 10, minHeight: 40, borderRadius: 8, backgroundColor: !symbol && market === item.value ? palette.mint : palette.background }}><Text style={{ color: !symbol && market === item.value ? palette.green : palette.ink, fontSize: 12, fontWeight: '600' }}>{item.label}</Text></Pressable>)}</View>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}><Button compact variant="secondary" onPress={() => setChoosing(true)}>{selected ? `${selected[1]} · ${symbol.split(':')[1]}` : 'Choose a company'}</Button>{symbol && <Button compact variant="quiet" onPress={() => setSymbol('')}>Clear company</Button>}<Copy muted style={{ fontSize: 11, flex: 1, minWidth: 160 }}>Filters use the source’s markets and symbols. Some companies may have no stories.</Copy></View>
      <ProviderWidget kind="news" newsMarket={market} newsSymbol={symbol} />
    </Card>
    {isAdmin && <View style={{ gap: 10, alignItems: 'flex-start' }}><Button compact variant="quiet" onPress={() => setPreview(value => !value)}>{preview ? 'Hide server news diagnostics' : 'Server news diagnostics'}</Button>{preview && <Card style={{ gap: 12, width: '100%' }}><Copy muted style={{ fontSize: 12 }}>Alpha Vantage is a separate server preview. Its News entitlement is not included with every free key.</Copy><NewsPreview /></Card>}</View>}
    <Modal visible={choosing} transparent animationType="fade" onRequestClose={() => setChoosing(false)}><View style={{ flex: 1, padding: 20, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(7,30,23,0.45)' }}><Card style={{ width: '100%', maxWidth: 440, maxHeight: '85%', gap: 14 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><CardTitle>Company news</CardTitle><Button compact variant="quiet" onPress={() => setChoosing(false)}>Close</Button></View><Field label="Find a company" value={query} onChangeText={setQuery} placeholder="Name or symbol" /><ScrollView keyboardShouldPersistTaps="handled">{stocks.map(([value, label]) => <Pressable key={value} accessibilityRole="button" onPress={() => { setSymbol(value); setChoosing(false); }} style={{ paddingVertical: 13, borderBottomWidth: 1, borderColor: palette.line }}><Text style={{ color: palette.ink, fontSize: 14 }}>{label}</Text><Copy muted style={{ fontSize: 11 }}>{value}</Copy></Pressable>)}{!stocks.length && <Copy muted>No matching company.</Copy>}</ScrollView></Card></View></Modal>
  </AppShell>;
}

function NewsPreview() {
  const feed = useFeed<NewsResponse>('/news');
  const articles = feed.data?.value?.articles;
  const failure = feed.data?.failureCode;
  return <View style={{ gap: 14 }}>
    <Button compact variant="secondary" loading={feed.loading} onPress={() => void feed.refresh()}>Refresh news status</Button>
    <Copy muted style={{ fontSize: 12 }}>One shared feed is cached for 6 hours. Full articles are not stored. Publication time and fetch time are separate.</Copy>
    {feed.error && <Notice tone="error">{feed.error}</Notice>}
    {failure && <Notice>{failure === 'NEWS_PREMIUM_REQUIRED' ? 'Alpha Vantage requires a Premium News entitlement for this key. The free plan has not returned articles.' : failure === 'NEWS_NOT_CONFIGURED' ? 'The server has no configured Alpha Vantage news key.' : 'The news source is unavailable or has reached its request limit. The last successful headlines remain below when available.'}</Notice>}
    {feed.loading && !feed.data && <Copy muted>Checking the news source…</Copy>}
    {feed.data && <Copy muted style={{ fontSize: 11 }}>Fetched: {dateTime(feed.data.fetchedAt)} · Next eligible check: {dateTime(feed.data.nextRefreshAt)} · Israel time{feed.data.stale ? ' · Last data may be old' : ''}</Copy>}
    {articles?.length === 0 && <Empty title="No headlines right now." detail="The source returned an empty feed. Check again later." />}
    {articles?.map(article => <Card key={article.id} style={{ gap: 10 }}><CardTitle>{article.title}</CardTitle><Copy muted style={{ fontSize: 11 }}>{article.source} · {article.sourceHost} · Published {dateTime(article.publishedAt)} (Israel)</Copy>{!!article.relatedInstrumentIds.length && <Copy muted>{article.relatedInstrumentIds.join(' · ')}</Copy>}<Button compact variant="secondary" onPress={() => void Linking.openURL(article.url)}>Read original article ↗</Button></Card>)}
  </View>;
}
