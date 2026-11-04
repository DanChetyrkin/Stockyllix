import { View } from 'react-native';
import { Field } from '@/components/ui/kit';
import { CalendarDateField } from './CalendarDateField';

export interface DateTimeFieldsProps {
  date: string; time?: string; onDateChange(value: string): void; onTimeChange?(value: string): void;
  minDate?: string; maxDate?: string; disabled?: boolean; dateLabel?: string;
}

export function DateTimeFields({ date, time = '', onDateChange, onTimeChange, minDate, maxDate, disabled, dateLabel = 'Date' }: DateTimeFieldsProps) {
  const timeParts = time.split(':');
  function changeTime(index: number, value: string) {
    const next = [...timeParts];
    next[index] = value.replace(/\D/g, '');
    onTimeChange?.([next[0] || '', next[1] || ''].join(':'));
  }
  return <View style={{ gap: 12 }}>
    <CalendarDateField label={dateLabel} value={date} onChange={onDateChange} minDate={minDate} maxDate={maxDate} disabled={disabled} />
    {onTimeChange && <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1 }}><Field label="Hour · Israel (24h)" value={timeParts[0] || ''} onChangeText={value => changeTime(0, value)} editable={!disabled} keyboardType="number-pad" maxLength={2} placeholder="HH" /></View>
      <View style={{ flex: 1 }}><Field label="Minute" value={timeParts[1] || ''} onChangeText={value => changeTime(1, value)} editable={!disabled} keyboardType="number-pad" maxLength={2} placeholder="MM" /></View>
    </View>}
  </View>;
}
