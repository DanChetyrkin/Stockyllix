import { View } from 'react-native';
import { Field } from '@/components/ui/kit';

export interface DateTimeFieldsProps {
  date: string; time?: string; onDateChange(value: string): void; onTimeChange?(value: string): void;
  minDate?: string; maxDate?: string; disabled?: boolean; dateLabel?: string;
}

export function DateTimeFields({ date, time = '', onDateChange, onTimeChange, disabled, dateLabel = 'Date' }: DateTimeFieldsProps) {
  const dateParts = date.split('-');
  const timeParts = time.split(':');
  function changeDate(index: number, value: string) {
    const next = [...dateParts];
    next[index] = value.replace(/\D/g, '');
    onDateChange([next[0] || '', next[1] || '', next[2] || ''].join('-'));
  }
  function changeTime(index: number, value: string) {
    const next = [...timeParts];
    next[index] = value.replace(/\D/g, '');
    onTimeChange?.([next[0] || '', next[1] || ''].join(':'));
  }
  return <View style={{ gap: 12 }}>
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1 }}><Field label={`${dateLabel} · Day`} value={dateParts[2] || ''} onChangeText={value => changeDate(2, value)} editable={!disabled} keyboardType="number-pad" maxLength={2} placeholder="DD" /></View>
      <View style={{ flex: 1 }}><Field label="Month" value={dateParts[1] || ''} onChangeText={value => changeDate(1, value)} editable={!disabled} keyboardType="number-pad" maxLength={2} placeholder="MM" /></View>
      <View style={{ flex: 1.4 }}><Field label="Year" value={dateParts[0] || ''} onChangeText={value => changeDate(0, value)} editable={!disabled} keyboardType="number-pad" maxLength={4} placeholder="YYYY" /></View>
    </View>
    {onTimeChange && <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1 }}><Field label="Hour · Israel (24h)" value={timeParts[0] || ''} onChangeText={value => changeTime(0, value)} editable={!disabled} keyboardType="number-pad" maxLength={2} placeholder="HH" /></View>
      <View style={{ flex: 1 }}><Field label="Minute" value={timeParts[1] || ''} onChangeText={value => changeTime(1, value)} editable={!disabled} keyboardType="number-pad" maxLength={2} placeholder="MM" /></View>
    </View>}
  </View>;
}
