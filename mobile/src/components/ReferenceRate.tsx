import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { api, errorMessage } from '@/api/client';
import { dateTime, number } from '@/utils/format';
import { Button, Copy } from './ui/kit';

interface ReferenceFx {
  rate: string;
  observedAt: string;
  stale: boolean;
  notice?: string;
}

export function ReferenceRate() {
  const [rate, setRate] = useState<ReferenceFx | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void api<ReferenceFx>('/reference/fx', { signal: controller.signal })
      .then(result => {
        if (!controller.signal.aborted) {
          setRate(result);
          setError(null);
        }
      })
      .catch(cause => {
        if (!controller.signal.aborted) setError(errorMessage(cause));
      });
    return () => controller.abort();
  }, [attempt]);
  return (
    <View style={{ gap: 6 }}>
      <Copy style={{ fontWeight: '700' }}>Bank of Israel · current reference</Copy>
      {rate ? (
        <>
          <Copy>1 USD = {number(rate.rate, 4)} ILS</Copy>
          <Copy muted style={{ fontSize: 12 }}>
            Published {dateTime(rate.observedAt)} · Israel time{rate.stale ? ' · Last saved rate' : ''}
          </Copy>
          <Copy muted style={{ fontSize: 12 }}>
            A daily representative rate, separate from the historical game clock. Trades use the rate available at their
            game execution time.
          </Copy>
        </>
      ) : (
        <Copy muted style={{ fontSize: 12 }}>
          {error || 'Checking the latest published USD/ILS rate…'}
        </Copy>
      )}
      {error && (
        <Button compact variant="quiet" onPress={() => setAttempt(value => value + 1)}>
          Retry rate
        </Button>
      )}
    </View>
  );
}
