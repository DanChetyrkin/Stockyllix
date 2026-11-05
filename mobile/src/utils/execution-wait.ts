export function executionWait(
  executeAt: string | null | undefined,
  gameAt: string | null | undefined,
  running: boolean,
  syncing = false,
): string {
  if (!executeAt || !gameAt) return 'No execution event is available in this price period.';
  const remaining = Date.parse(executeAt) - Date.parse(gameAt);
  if (!Number.isFinite(remaining)) return 'Refresh game time to see the expected wait.';
  if (syncing || remaining <= 0) return 'Waiting for the server to finish the execution event.';
  const minutes = Math.ceil(remaining / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  const duration = [days && `${days}d`, hours && `${hours}h`, rest && `${rest}m`].filter(Boolean).join(' ');
  return running ? `About ${duration} at 1× speed.` : `${duration} of game time remaining · clock paused.`;
}

export function executionDate(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'No future event';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Jerusalem',
  }).format(new Date(value));
}
