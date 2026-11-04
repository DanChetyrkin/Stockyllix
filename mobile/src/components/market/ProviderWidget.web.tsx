import { useEffect, useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { Button, Copy } from '@/components/ui/kit';
import { newsSourceUrl, type ProviderWidgetProps } from './news-options';

export function ProviderWidget({ kind, newsMarket = 'all', newsSymbol = '' }: ProviderWidgetProps) {
  const { mode } = useTheme();
  const [revision, setRevision] = useState(0);
  const [newsHeight, setNewsHeight] = useState(580);
  const frame = useRef<HTMLIFrameElement>(null);
  const source = kind === 'markets' ? 'https://www.tradingview.com/markets/stocks-israel/' : newsSourceUrl(newsSymbol);
  useEffect(() => {
    if (kind !== 'news') return;
    // only the isolated wrapper can report its own outer layout height.
    const resize = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.type !== 'stockyllix-widget-size') return;
      const height = event.data.height;
      if (typeof height === 'number' && Number.isFinite(height) && height >= 120 && height <= 20000) setNewsHeight(Math.ceil(height));
    };
    window.addEventListener('message', resize);
    return () => window.removeEventListener('message', resize);
  }, [kind]);
  const query = new URLSearchParams({ kind, theme: mode, market: newsMarket, symbol: newsSymbol });
  return <View style={{ gap: 12 }}>
    <iframe ref={frame} key={`${mode}/${revision}/${newsMarket}/${newsSymbol}`} title={kind === 'markets' ? 'TradingView delayed market prices' : 'TradingView current market news'} src={`/provider-widget.html?${query}`} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" style={{ width: '100%', height: kind === 'markets' ? 650 : newsHeight, border: 0, borderRadius: 10 }} />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}><Copy muted style={{ fontSize: 11, flex: 1 }}>TradingView · source links open the original story.</Copy><Button compact variant="quiet" onPress={() => setRevision(value => value + 1)}>Reload</Button><Button compact variant="quiet" onPress={() => void Linking.openURL(source)}>Open source ↗</Button></View>
  </View>;
}
