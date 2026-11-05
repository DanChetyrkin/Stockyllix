import { View } from 'react-native';
import { AppShell } from '@/components/AppShell';
import { MarketModes } from '@/components/market/MarketModes';
import { ProviderWidget } from '@/components/market/ProviderWidget';
import { Badge, Card, Copy, PageTitle } from '@/components/ui/kit';

export default function CurrentMarketScreen() {
  return (
    <AppShell>
      <MarketModes />
      <PageTitle title="Current market" subtitle="TradingView market watch. These quotes do not execute game orders." />
      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Badge>TradingView</Badge>
          <Badge tone="warning">May be delayed</Badge>
          <Badge>Display only · no trading</Badge>
        </View>
        <Copy muted>
          Source prices may be delayed or show the last session close; the source’s session and delay labels apply. Game
          orders use the active game’s dated prices and currency rates, never this panel. Tel Aviv quotes here use ILA
          (agorot): 100 ILA = ₪1.
        </Copy>
        <ProviderWidget kind="markets" />
      </Card>
    </AppShell>
  );
}
