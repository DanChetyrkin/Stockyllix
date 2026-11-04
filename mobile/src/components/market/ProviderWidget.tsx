import { Linking } from 'react-native';
import { Button, Card, Copy } from '@/components/ui/kit';

export function ProviderWidget({ kind }: { kind: 'markets' | 'news' }) {
  return <Card style={{ gap: 14 }}><Copy>The public market panel is available in the browser version. You can also open the original source.</Copy><Button onPress={() => void Linking.openURL(kind === 'markets' ? 'https://stockyllix.web.app/current-market' : 'https://stockyllix.web.app/news')}>Open browser view ↗</Button></Card>;
}
