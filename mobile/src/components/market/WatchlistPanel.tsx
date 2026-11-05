import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { api, errorMessage } from '@/api/client';
import type { Instrument } from '@/api/types';
import { Badge, Button, Card, CardTitle, Copy, DataState, Field, Notice, useThemedStyles } from '@/components/ui/kit';
import { useGame } from '@/context/GameContext';
import { useTheme } from '@/context/ThemeContext';
import { useApi } from '@/hooks/use-api';
import { number } from '@/utils/format';
import type { WatchDirection, WatchItem, WatchlistResponse } from './types';

export function WatchlistPanel({
  instrument,
  onSelect,
  selectionDisabled,
}: {
  instrument: Instrument;
  onSelect(id: string): void;
  selectionDisabled: boolean;
}) {
  const { palette } = useTheme();
  const ui = useThemedStyles();
  const watchlist = useApi<WatchlistResponse>('/watchlist');
  const existing = watchlist.data?.items.find(item => item.instrumentId === instrument.id);

  return (
    <Card style={{ gap: 16 }}>
      <CardTitle>Your price watch.</CardTitle>
      <Copy muted style={{ fontSize: 12 }}>
        Follow {instrument.symbol} at a target in {instrument.currency}. Targets are personal reminders inside the app,
        not trading orders or notifications.
      </Copy>
      <DataState
        loading={watchlist.loading}
        error={watchlist.error}
        hasData={!!watchlist.data}
        retry={() => void watchlist.refresh()}
      >
        {watchlist.data && (
          <>
            <WatchTargetEditor
              key={instrument.id}
              instrument={instrument}
              existing={existing}
              refresh={watchlist.refresh}
            />
            <View style={ui.divider} />
            {!watchlist.data.items.length ? (
              <Copy muted style={{ fontSize: 12 }}>
                No watched assets yet. Add your first target above.
              </Copy>
            ) : (
              watchlist.data.items.map(item => (
                <Pressable
                  key={item.instrumentId}
                  accessibilityRole="button"
                  accessibilityLabel={`Explore ${item.name}. Target ${item.direction === 'at_or_below' ? 'at or below' : 'at or above'} ${item.targetPrice} ${item.currency}. ${item.reached ? 'Target condition met' : 'Waiting for target'}.`}
                  accessibilityState={{ disabled: selectionDisabled, selected: item.instrumentId === instrument.id }}
                  disabled={selectionDisabled}
                  onPress={() => onSelect(item.instrumentId)}
                  style={({ pressed }) => [
                    {
                      padding: 11,
                      borderRadius: 9,
                      gap: 6,
                      borderWidth: 1,
                      borderColor: palette.line,
                      backgroundColor: item.instrumentId === instrument.id ? palette.mint : palette.background,
                    },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6 }}>
                    <Copy style={{ fontWeight: '700', fontSize: 12 }}>{item.symbol}</Copy>
                    <Badge tone={item.reached ? 'positive' : 'neutral'}>
                      {item.reached ? 'Target condition met' : 'Watching'}
                    </Badge>
                  </View>
                  <Copy muted style={{ fontSize: 11 }}>
                    {item.direction === 'at_or_below' ? '≤' : '≥'} {number(item.targetPrice, 6)} {item.currency} · Now{' '}
                    {number(item.currentPrice, 6)}
                  </Copy>
                </Pressable>
              ))
            )}
          </>
        )}
      </DataState>
    </Card>
  );
}

function WatchTargetEditor({
  instrument,
  existing,
  refresh,
}: {
  instrument: Instrument;
  existing?: WatchItem;
  refresh(): Promise<void>;
}) {
  const { world } = useGame();
  const [target, setTarget] = useState(existing?.targetPrice ?? instrument.price);
  const [direction, setDirection] = useState<WatchDirection>(existing?.direction ?? 'at_or_below');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function save(remove = false) {
    if (inFlight.current) return;
    if (!remove && (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(target) || Number(target) <= 0)) {
      setError('Enter a positive target price with up to six decimal places.');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api(remove ? '/watchlist/remove' : '/watchlist', {
        method: 'POST',
        body: remove
          ? { instrumentId: instrument.id }
          : { instrumentId: instrument.id, targetPrice: target, direction },
      });
      await refresh();
      setMessage(remove ? 'Removed from your watchlist.' : 'Target saved. No order has been placed.');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <Field
        label={`Target price (${instrument.currency})`}
        value={target}
        onChangeText={setTarget}
        keyboardType="decimal-pad"
        editable={!busy}
        hint="Enter digits and a decimal point; no commas."
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button
            compact
            disabled={busy}
            variant={direction === 'at_or_below' ? 'primary' : 'secondary'}
            onPress={() => setDirection('at_or_below')}
          >
            At or below
          </Button>
        </View>
        <View style={{ flex: 1 }}>
          <Button
            compact
            disabled={busy}
            variant={direction === 'at_or_above' ? 'primary' : 'secondary'}
            onPress={() => setDirection('at_or_above')}
          >
            At or above
          </Button>
        </View>
      </View>
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      <Button compact loading={busy} disabled={world?.status === 'advancing'} onPress={() => void save()}>
        {existing ? 'Update target' : 'Add to watchlist'}
      </Button>
      {existing && (
        <Button
          compact
          variant="quiet"
          disabled={busy || world?.status === 'advancing'}
          onPress={() => void save(true)}
        >
          Remove {instrument.symbol}
        </Button>
      )}
    </>
  );
}
