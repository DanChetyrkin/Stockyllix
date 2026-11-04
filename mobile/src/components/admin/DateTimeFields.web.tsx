import { createElement, type CSSProperties } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import type { DateTimeFieldsProps } from './DateTimeFields';
import { CalendarDateField } from './CalendarDateField';

export function DateTimeFields({ date, time = '', onDateChange, onTimeChange, minDate, maxDate, disabled, dateLabel = 'Date' }: DateTimeFieldsProps) {
  const { palette, mode } = useTheme();
  const inputStyle: CSSProperties = { boxSizing: 'border-box', width: '100%', minWidth: 0, minHeight: 48, border: `1px solid ${palette.inputBorder}`, borderRadius: 9, padding: '10px 12px', backgroundColor: palette.paper, color: palette.ink, font: 'inherit', fontSize: 15, colorScheme: mode };
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
    <View style={{ flex: 1.4, minWidth: 155 }}><CalendarDateField label={dateLabel} value={date} onChange={onDateChange} minDate={minDate} maxDate={maxDate} disabled={disabled} /></View>
    {onTimeChange && <View style={{ flex: 1, minWidth: 125 }}>{createElement('label', { style: { display: 'grid', gap: 7, color: palette.ink, fontSize: 13, fontWeight: 600 } }, 'Time · Israel (24h)', createElement('input', { type: 'time', step: 60, value: time, disabled, onChange: event => onTimeChange(event.currentTarget.value), style: inputStyle }))}</View>}
  </View>;
}
