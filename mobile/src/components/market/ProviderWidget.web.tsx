import { useState } from 'react';
import { Linking, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { Button, Copy } from '@/components/ui/kit';

export function ProviderWidget({ kind }: { kind: 'markets' | 'news' }) {
  const { mode } = useTheme();
  const [revision, setRevision] = useState(0);
  return <View style={{ gap: 12 }}>
    <iframe key={`${mode}/${revision}`} title={kind === 'markets' ? 'TradingView delayed market prices' : 'TradingView current market news'} src={`/provider-widget.html?kind=${kind}&theme=${mode}`} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" style={{ width: '100%', height: kind === 'markets' ? 650 : 600, border: 0, borderRadius: 12 }} />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}><Copy muted style={{ fontSize: 11, flex: 1 }}>Provided by TradingView. If the panel is unavailable, reopen it or visit the source.</Copy><Button compact variant="quiet" onPress={() => setRevision(value => value + 1)}>Reload panel</Button><Button compact variant="quiet" onPress={() => void Linking.openURL(kind === 'markets' ? 'https://www.tradingview.com/markets/stocks-israel/' : 'https://www.tradingview.com/news/')}>Open source ↗</Button></View>
  </View>;
}
