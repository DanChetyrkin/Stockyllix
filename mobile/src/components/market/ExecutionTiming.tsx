import { Text, View } from 'react-native';
import { useGame } from '@/context/GameContext';
import { useTheme } from '@/context/ThemeContext';
import { executionDate, executionWait } from '@/utils/execution-wait';
import { Copy } from '../ui/kit';

export function ExecutionTiming({ at, kind, market, pending = false }: { at?: string | null; kind?: string | null; market: 'TA' | 'US'; pending?: boolean }) {
  const { world } = useGame();
  const { palette } = useTheme();
  const clock = world?.clock;
  return <View style={{ gap: 7, padding: 16, borderRadius: 10, backgroundColor: palette.mint }}>
    <Copy style={{ fontSize: 12, fontWeight: '600' }}>{pending ? 'Pending · expected execution' : 'Expected execution'} · {market === 'TA' ? 'Tel Aviv' : 'United States'}</Copy>
    <Text style={{ color: palette.ink, fontSize: 19, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{executionDate(at)}</Text>
    <Copy muted style={{ fontSize: 12 }}>Israel game time{kind === 'MARKET_CLOSE' ? ' · session close' : kind === 'MARKET_OPEN' ? ' · next opening' : ''}</Copy>
    <Copy style={{ fontWeight: '600', fontSize: 13 }}>{executionWait(at, clock?.targetNow || world?.now, !!clock?.running, world?.status === 'advancing' || !!clock?.syncing)}</Copy>
    {at && <Copy muted style={{ fontSize: 11 }}>{clock?.running ? 'The server advances game time automatically. An administrator can skip ahead.' : 'An administrator can resume the clock or skip to execution.'} Acceptance reserves cash or units; execution changes the portfolio.</Copy>}
  </View>;
}
