import { Linking } from 'react-native';
import { Button, Card, Copy } from '@/components/ui/kit';
import { newsSourceUrl, type ProviderWidgetProps } from './news-options';

export function ProviderWidget({ kind, newsSymbol }: ProviderWidgetProps) {
  return <Card style={{ gap: 14 }}><Copy>The TradingView panel is available in the browser. {kind === 'news' ? 'Open the selected company’s news at the source, or use the website for market filters.' : 'Open the website to view current quotes.'}</Copy><Button onPress={() => void Linking.openURL(kind === 'markets' ? 'https://stockyllix.web.app/current-market' : newsSourceUrl(newsSymbol))}>Open {kind === 'markets' ? 'browser view' : 'news source'} ↗</Button></Card>;
}
