import { useState } from 'react';
import { Linking, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { Button, Copy } from '@/components/ui/kit';
import { newsSourceUrl, type ProviderWidgetProps } from './news-options';

// external scripts run on a separate origin with no account storage.
const panelOrigin = 'https://stockyllix-panels.web.app';

export function ProviderWidget({ kind, newsMarket = 'all', newsSymbol = '' }: ProviderWidgetProps) {
  const { mode } = useTheme();
  const [revision, setRevision] = useState(0);
  const source = kind === 'markets' ? 'https://www.tradingview.com/markets/stocks-israel/' : newsSourceUrl(newsSymbol);
  const query = new URLSearchParams({ kind, theme: mode, market: newsMarket, symbol: newsSymbol });
  return (
    <View style={{ gap: 12 }}>
      <iframe
        key={`${mode}/${revision}/${newsMarket}/${newsSymbol}`}
        title={kind === 'markets' ? 'TradingView delayed market prices' : 'TradingView current market news'}
        src={`${panelOrigin}/provider-widget.html?${query}`}
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        style={{ width: '100%', height: kind === 'markets' ? 650 : 620, border: 0, borderRadius: 10 }}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <Copy muted style={{ fontSize: 11, flex: 1 }}>
          TradingView · source links open the original story.
        </Copy>
        <Button compact variant="quiet" onPress={() => setRevision(value => value + 1)}>
          Reload
        </Button>
        <Button compact variant="quiet" onPress={() => void Linking.openURL(source)}>
          Open source ↗
        </Button>
      </View>
    </View>
  );
}
