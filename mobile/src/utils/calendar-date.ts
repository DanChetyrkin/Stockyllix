function dateInstant(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const instant = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(instant.getTime()) && instant.toISOString().slice(0, 10) === value ? instant : null;
}

export function calendarDateAllowed(value: string, minDate?: string, maxDate?: string) {
  return !!dateInstant(value) && (!minDate || value >= minDate) && (!maxDate || value <= maxDate);
}

export function calendarMonth(value: string, minDate?: string, maxDate?: string) {
  let date = dateInstant(value) ? value : minDate || maxDate || new Date().toISOString().slice(0, 10);
  if (minDate && date < minDate) date = minDate;
  if (maxDate && date > maxDate) date = maxDate;
  return date.slice(0, 7);
}

// calendar arithmetic uses utc, so a device zone or daylight change cannot move a day.
export function calendarMonthDays(month: string): (string | null)[] {
  const first = dateInstant(`${month}-01`);
  if (!first) throw new Error('Invalid calendar month');
  const next = new Date(first);
  next.setUTCMonth(next.getUTCMonth() + 1);
  next.setUTCDate(0);
  const days = next.getUTCDate();
  return Array.from({ length: 42 }, (_, index) => {
    const day = index - first.getUTCDay() + 1;
    return day > 0 && day <= days ? `${month}-${String(day).padStart(2, '0')}` : null;
  });
}

export function shiftCalendarMonth(month: string, amount: number) {
  const first = dateInstant(`${month}-01`);
  if (!first) throw new Error('Invalid calendar month');
  first.setUTCMonth(first.getUTCMonth() + amount);
  return first.toISOString().slice(0, 7);
}

export function calendarMonthAllowed(month: string, minDate?: string, maxDate?: string) {
  const days = calendarMonthDays(month).filter((value): value is string => value !== null);
  return (!minDate || days.at(-1)! >= minDate) && (!maxDate || days[0]! <= maxDate);
}

export function calendarDateLabel(date: string) {
  const instant = dateInstant(date);
  return instant
    ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
        instant,
      )
    : 'Choose date';
}

export function calendarMonthLabel(month: string) {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
}
