import { useState } from 'react';
import { Linking, View } from 'react-native';
import type { NewsResponse } from '@/api/feeds';
import { AppShell } from '@/components/AppShell';
import { ProviderWidget } from '@/components/market/ProviderWidget';
import { Badge, Button, Card, CardTitle, Copy, Empty, Notice, PageTitle } from '@/components/ui/kit';
import { useGame } from '@/context/GameContext';
import { useFeed } from '@/hooks/use-feed';
import { dateTime } from '@/utils/format';

export default function NewsScreen() {
  const { isAdmin } = useGame();
  const [preview, setPreview] = useState(false);
  return <AppShell><PageTitle title="Beyond the ticker." subtitle="News from the real world, independent of the demo date. Open the original article for its full context." />
    <Card style={{ gap: 14 }}><View style={{ flexDirection: 'row', gap: 8 }}><Badge>Current news</Badge><Badge>TradingView</Badge></View><Copy muted>Headlines and publication times are supplied by the source. These stories are not from the historical demo period.</Copy><ProviderWidget kind="news" /></Card>
    {isAdmin && <Card style={{ gap: 12 }}><CardTitle>Owner news preview</CardTitle><Copy muted>The server adapter uses Alpha Vantage. Availability depends on the account’s News entitlement; a free API key alone may not include it.</Copy><Button compact variant="secondary" onPress={() => setPreview(value => !value)}>{preview ? 'Close API preview' : 'Open API preview'}</Button>{preview && <NewsPreview />}</Card>}
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
