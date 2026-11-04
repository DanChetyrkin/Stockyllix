import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import type { CurrentMarketFeed, CurrentQuote } from '@/api/feeds';
import { AppShell } from '@/components/AppShell';
import { MarketModes } from '@/components/market/MarketModes';
import { ProviderWidget } from '@/components/market/ProviderWidget';
import { Badge, Button, Card, CardTitle, Copy, Field, Notice, PageTitle } from '@/components/ui/kit';
import { useGame } from '@/context/GameContext';
import { useTheme } from '@/context/ThemeContext';
import { useFeed } from '@/hooks/use-feed';
import { dateTime, number } from '@/utils/format';

export default function CurrentMarketScreen() {
  const { isAdmin } = useGame();
  const [preview, setPreview] = useState(false);
  return <AppShell>
    <MarketModes />
    <PageTitle title="The market, today." subtitle="Real-world prices and daily moves. Your demo portfolio follows its own historical game clock." />
    <Card style={{ gap: 14 }}><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Badge>TradingView</Badge><Badge tone="warning">Delayed data</Badge><Badge>Market watch · no orders</Badge></View><Copy muted>Prices are supplied by the source and may be delayed or show the last session close. Source delay and session labels apply. Tel Aviv quotes in this panel use ILA (agorot): 100 ILA = ₪1.</Copy><ProviderWidget kind="markets" /></Card>
    {isAdmin && <Card style={{ gap: 12 }}><CardTitle>Owner data preview</CardTitle><Copy muted>Inspect the server’s current Yahoo quotes, source timestamps and shared refresh status. This private preview is separate from the public market panel and never sets demo execution prices.</Copy><Button compact variant="secondary" onPress={() => setPreview(value => !value)}>{preview ? 'Close server preview' : 'Open server preview'}</Button>{preview && <ServerQuotes />}</Card>}
  </AppShell>;
}

function ServerQuotes() {
  const feed = useFeed<CurrentMarketFeed>('/market/current');
  const [query, setQuery] = useState('');
  const [market, setMarket] = useState('all');
  const [descending, setDescending] = useState(true);
  const quotes = (feed.data?.quotes ?? []).filter(quote => (market === 'all' || market === quote.market) && `${quote.symbol} ${quote.name}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.changePercent === null ? b.changePercent === null ? a.name.localeCompare(b.name) : 1 : b.changePercent === null ? -1 : (Number(a.changePercent) - Number(b.changePercent)) * (descending ? -1 : 1));
  return <View style={{ gap: 14 }}>
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}><Badge>Yahoo · regular session only</Badge><Badge tone="warning">Delay not guaranteed</Badge><Button compact loading={feed.loading} variant="secondary" onPress={() => void feed.refresh()}>Refresh status</Button></View>
    <Copy muted style={{ fontSize: 12 }}>Quotes refresh on demand through a shared server cache, at most once per 10 minutes. This page checks status every 2 minutes while active. Pre-market and after-hours prices are excluded.</Copy>
    {feed.error && <Notice tone="error">{feed.error}</Notice>}
    {feed.loading && !feed.data && <Copy muted>Fetching the latest source observations…</Copy>}
    {feed.data && <>
      <Copy muted style={{ fontSize: 11 }}>Last successful batch fetch: {dateTime(feed.data.fetchedAt)} · Next eligible refresh: {dateTime(feed.data.nextRefreshAt)} · Israel time</Copy>
      {feed.data.refreshing && <Copy muted>A shared refresh is in progress. Available observations stay visible.</Copy>}
      {feed.data.status === 'unavailable' && <Notice>The source is currently unavailable. No replacement prices have been created.</Notice>}
      {feed.data.stale && feed.data.status !== 'unavailable' && <Notice>Some observations are old or could not be refreshed. Check each quote’s timestamp and status.</Notice>}
      <Field label="Find a current quote" value={query} onChangeText={setQuery} placeholder="Name or symbol" />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>{['all', 'TA', 'US'].map(item => <Button key={item} compact variant={market === item ? 'primary' : 'secondary'} onPress={() => setMarket(item)}>{item === 'all' ? 'All 20' : item === 'TA' ? 'Tel Aviv' : 'United States'}</Button>)}<Button compact variant="quiet" onPress={() => setDescending(value => !value)}>Daily change {descending ? '↓' : '↑'}</Button></View>
      {quotes.map(quote => <QuoteRow key={quote.instrumentId} quote={quote} />)}
    </>}
  </View>;
}

function QuoteRow({ quote }: { quote: CurrentQuote }) {
  const { palette } = useTheme();
  const change = quote.changePercent === null ? null : Number(quote.changePercent);
  return <View style={{ paddingVertical: 16, borderTopWidth: 1, borderColor: palette.line, gap: 8 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}><View style={{ gap: 3 }}><Text style={{ color: palette.ink, fontWeight: '700', fontSize: 16 }}>{quote.symbol} · {quote.name}</Text><Copy muted style={{ fontSize: 11 }}>{quote.market === 'TA' ? 'Tel Aviv' : 'United States'} · regular session · {quote.marketState}</Copy></View><View style={{ alignItems: 'flex-end', gap: 3 }}><Text style={{ color: palette.ink, fontWeight: '700', fontSize: 19 }}>{quote.price === null ? '—' : `${quote.currency === 'USD' ? '$' : '₪'}${number(quote.price)}`}</Text><Text style={{ color: change === null ? palette.muted : change < 0 ? palette.red : palette.green, fontSize: 12 }}>{change === null ? 'Daily change unavailable' : `${change > 0 ? '+' : ''}${change.toFixed(2)}% vs prior session close`}</Text></View></View>
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}><Badge tone={quote.stale ? 'warning' : 'neutral'}>{quote.price === null ? 'Unavailable' : quote.stale ? 'Old / refresh failed' : quote.marketState === 'closed' ? 'Last session quote' : 'Latest source quote'}</Badge><Badge>{quote.timeliness === 'delayed' ? `${quote.delayMinutes} min delayed` : 'Delay unknown · not guaranteed live'}</Badge></View>
    <Copy muted style={{ fontSize: 11 }}>Price time: {dateTime(quote.priceAt)} · Fetched: {dateTime(quote.fetchedAt)} · Israel time</Copy><Copy muted style={{ fontSize: 10 }}>Exchange timezone: {quote.exchangeTimezone}{quote.providerCurrency === 'ILA' ? ' · ILA normalized to ILS' : ''}</Copy>
    <Button compact variant="quiet" onPress={() => void Linking.openURL(quote.sourceUrl)}>View Yahoo source ↗</Button>
  </View>;
}
