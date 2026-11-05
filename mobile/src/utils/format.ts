export function money(value: string | number | undefined, digits = 2) {
  if (value === undefined) return '—';
  const amount = Number(value);
  return Number.isFinite(amount) ? new Intl.NumberFormat('en-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount) : '—';
}

export function number(value: string | number | undefined, digits = 2) {
  if (value === undefined || !Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(Number(value));
}

// an asset's own price: dollars for us listings, shekels for tel aviv.
export function assetPrice(value: string | number | undefined, currency: 'ILS' | 'USD' | undefined, digits = 2) {
  const symbol = currency === 'USD' ? '$' : currency === 'ILS' ? '₪' : '';
  return `${symbol}${number(value, digits)}`;
}

export function percent(value: string | number | undefined, signed = false) {
  if (value === undefined || !Number.isFinite(Number(value))) return '—';
  const amount = Number(value);
  return `${signed && amount > 0 ? '+' : ''}${amount.toFixed(2)}%`;
}

export function dateTime(value: string | undefined | null) {
  if (!value || Number.isNaN(new Date(value).getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem', hour12: false }).format(new Date(value));
}

export function day(value: string | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jerusalem' }).format(new Date(value));
}

export function clockTime(value: string | undefined) {
  if (!value || Number.isNaN(new Date(value).getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jerusalem', hour12: false }).format(new Date(value));
}

export function observationDate(value: string | undefined) {
  if (!value) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const observed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(observed.getTime())) return '—';
    return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(observed);
  }
  return dateTime(value);
}
