import { useState } from 'react';
import { View } from 'react-native';
import { Copy } from '@/components/ui/kit';
import { useTheme } from '@/context/ThemeContext';
import { dateTime, number } from '@/utils/format';
import type { PricePoint } from './types';

export function PriceChart({ points, currency, symbol }: { points: PricePoint[]; currency: string; symbol: string }) {
  const { palette } = useTheme();
  const [width, setWidth] = useState(0);
  const samples = points.filter(point => Number.isFinite(Number(point.price)) && Number.isFinite(Date.parse(point.at)));
  if (!samples.length) return <Copy muted>No known prices yet.</Copy>;
  const values = samples.map(point => Number(point.price));
  const low = Math.min(...values);
  const high = Math.max(...values);
  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  const start = Date.parse(first.at);
  const duration = Date.parse(last.at) - start;
  const chartHeight = 138;
  const coordinates = samples.map(point => ({
    x: duration ? ((Date.parse(point.at) - start) / duration) * Math.max(0, width - 8) + 4 : width / 2,
    y: high > low ? 12 + ((high - Number(point.price)) / (high - low)) * (chartHeight - 24) : chartHeight / 2,
  }));

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <Copy muted style={{ fontSize: 11 }}>
          High {number(high)} {currency}
        </Copy>
        <Copy muted style={{ fontSize: 11 }}>
          Low {number(low)} {currency}
        </Copy>
      </View>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`${symbol} price history. ${samples.length} known observations. First ${number(first.price)} ${currency}; latest ${number(last.price)} ${currency}. Lowest ${number(low)}, highest ${number(high)}.`}
        onLayout={event => setWidth(event.nativeEvent.layout.width)}
        style={{
          height: chartHeight,
          overflow: 'hidden',
          borderBottomWidth: 1,
          borderColor: palette.line,
          backgroundColor: palette.background,
          borderRadius: 8,
        }}
      >
        {[0.25, 0.5, 0.75].map(value => (
          <View
            key={value}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: chartHeight * value,
              height: 1,
              backgroundColor: palette.line,
            }}
          />
        ))}
        {/* line segments use known observations only; gaps are not live quotes. */}
        {width > 0 &&
          coordinates.slice(1).map((point, index) => {
            const previous = coordinates[index]!;
            const dx = point.x - previous.x;
            const dy = point.y - previous.y;
            const length = Math.hypot(dx, dy);
            return (
              <View
                key={`${samples[index + 1]!.at}-${index}`}
                style={{
                  position: 'absolute',
                  left: (previous.x + point.x - length) / 2,
                  top: (previous.y + point.y) / 2 - 1,
                  width: length,
                  height: 2,
                  backgroundColor: palette.green,
                  transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
                }}
              />
            );
          })}
        {width > 0 &&
          coordinates.map((point, index) => (
            <View
              key={`dot-${index}`}
              style={{
                position: 'absolute',
                left: point.x - 2.5,
                top: point.y - 2.5,
                width: 5,
                height: 5,
                borderRadius: 3,
                backgroundColor: palette.green,
              }}
            />
          ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <Copy muted style={{ fontSize: 10 }}>
          {dateTime(first.at)}
        </Copy>
        {samples.length > 1 && (
          <Copy muted style={{ fontSize: 10, textAlign: 'right' }}>
            {dateTime(last.at)}
          </Copy>
        )}
      </View>
      {samples.length === 1 && (
        <Copy muted style={{ fontSize: 11 }}>
          Only the starting price is known. More observations appear when the shared clock advances.
        </Copy>
      )}
    </View>
  );
}
