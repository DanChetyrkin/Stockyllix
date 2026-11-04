import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Copy } from '@/components/ui/kit';
import { useTheme } from '@/context/ThemeContext';
import { calendarDateAllowed, calendarDateLabel, calendarMonth, calendarMonthAllowed, calendarMonthDays, calendarMonthLabel, shiftCalendarMonth } from '@/utils/calendar-date';

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function CalendarDateField({ label = 'Date', value, onChange, minDate, maxDate, disabled }: {
  label?: string; value: string; onChange(value: string): void; minDate?: string; maxDate?: string; disabled?: boolean;
}) {
  const { palette } = useTheme();
  const [month, setMonth] = useState<string | null>(null);
  const previous = month ? shiftCalendarMonth(month, -1) : '';
  const next = month ? shiftCalendarMonth(month, 1) : '';
  const close = () => setMonth(null);

  return <View style={{ gap: 7 }}>
    <Text style={{ color: palette.ink, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${calendarDateLabel(value)}`} accessibilityHint="Opens a calendar. Select a day to change the date." accessibilityState={{ disabled: !!disabled, expanded: month !== null }} disabled={disabled} onPress={() => setMonth(calendarMonth(value, minDate, maxDate))} style={({ pressed }) => ({ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderWidth: 1, borderColor: palette.inputBorder, backgroundColor: palette.paper, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 11, opacity: disabled ? 0.5 : pressed ? 0.75 : 1 })}>
      <Text style={{ color: palette.ink, fontSize: 15, flexShrink: 1 }}>{calendarDateLabel(value)}</Text><Text accessibilityElementsHidden importantForAccessibility="no" style={{ fontSize: 23, color: palette.green }}>▦</Text>
    </Pressable>
    <Modal transparent visible={month !== null} animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(7, 30, 23, 0.45)', padding: 16 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel date selection" onPress={close} style={StyleSheet.absoluteFill} />
        {month && <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 360, maxHeight: '90%', backgroundColor: palette.paper, borderRadius: 16, padding: 16, gap: 12 }}>
          <View style={{ gap: 4 }}><Text accessibilityRole="header" style={{ color: palette.ink, fontSize: 19, fontWeight: '700' }}>Choose {label.toLowerCase()}</Text><Copy muted style={{ fontSize: 12 }}>Select a day on the calendar · Israel date</Copy></View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <MonthButton label={`Previous month, ${calendarMonthLabel(previous)}`} disabled={!calendarMonthAllowed(previous, minDate, maxDate)} onPress={() => setMonth(previous)}>‹</MonthButton>
            <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={{ color: palette.ink, fontSize: 17, fontWeight: '700', textAlign: 'center', flex: 1 }}>{calendarMonthLabel(month)}</Text>
            <MonthButton label={`Next month, ${calendarMonthLabel(next)}`} disabled={!calendarMonthAllowed(next, minDate, maxDate)} onPress={() => setMonth(next)}>›</MonthButton>
          </View>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 4 }}>
            <View style={{ flexDirection: 'row' }}>{weekdays.map(day => <View key={day} style={{ flex: 1, alignItems: 'center', paddingVertical: 6 }}><Text style={{ color: palette.muted, fontSize: 11, fontWeight: '600' }}>{day}</Text></View>)}</View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{calendarMonthDays(month).map((date, index) => {
              const unavailable = !date || !calendarDateAllowed(date, minDate, maxDate) || !!disabled;
              const selected = date === value;
              return <View key={date || `blank-${index}`} style={{ width: `${100 / 7}%`, padding: 2 }}>{date ? <Pressable accessibilityRole="button" accessibilityLabel={calendarDateLabel(date)} accessibilityState={{ disabled: unavailable, selected }} disabled={unavailable} onPress={() => { onChange(date); close(); }} style={({ pressed }) => ({ minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: selected ? palette.primary : pressed ? palette.soft : 'transparent', opacity: unavailable ? 0.3 : 1 })}><Text style={{ color: selected ? palette.onPrimary : palette.ink, fontSize: 14, fontWeight: selected ? '700' : '500', fontVariant: ['tabular-nums'] }}>{Number(date.slice(-2))}</Text></Pressable> : <View style={{ minHeight: 40 }} />}</View>;
            })}</View>
          </ScrollView>
          {(minDate || maxDate) && <Copy muted style={{ fontSize: 11 }}>{minDate ? calendarDateLabel(minDate) : 'Any earlier date'} – {maxDate ? calendarDateLabel(maxDate) : 'Any later date'}</Copy>}
          <Button compact variant="secondary" onPress={close}>Cancel</Button>
        </View>}
      </View>
    </Modal>
  </View>;
}

function MonthButton({ label, disabled, onPress, children }: React.PropsWithChildren<{ label: string; disabled: boolean; onPress(): void }>) {
  const { palette } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: palette.soft, opacity: disabled ? 0.3 : pressed ? 0.75 : 1 })}><Text style={{ color: palette.ink, fontSize: 27, lineHeight: 30 }}>{children}</Text></Pressable>;
}
