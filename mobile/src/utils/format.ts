export function money(value: string | number | undefined, digits = 2) {
  if (value === undefined) return '—';
  const amount = Number(value);
  return Number.isFinite(amount) ? new Intl.NumberFormat('en-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount) : '—';
}

export function number(value: string | number | undefined, digits = 2) {
  if (value === undefined || !Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(Number(value));
}

export function percent(value: string | number | undefined, signed = false) {
  if (value === undefined || !Number.isFinite(Number(value))) return '—';
  const amount = Number(value);
  return `${signed && amount > 0 ? '+' : ''}${amount.toFixed(2)}%`;
}

export function dateTime(value: string | undefined | null, timeZone = 'Asia/Jerusalem') {
  if (!value || Number.isNaN(new Date(value).getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone, hour12: false }).format(new Date(value));
}

export function day(value: string | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Jerusalem' }).format(new Date(value));
}
