import 'dotenv/config';

if (
  process.env.FIREBASE_PROJECT_ID !== 'demo-stockyllix' ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099' ||
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
  process.env.NODE_ENV === 'production'
)
  throw new Error('this smoke test is local-emulator only');

const base = 'http://127.0.0.1:3000/api';
async function login(email: string): Promise<string> {
  const response = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'stockyllix-local-demo', returnSecureToken: true }),
    },
  );
  const result = (await response.json()) as { idToken: string };
  if (!response.ok || !result.idToken) throw new Error('local sign-in failed; run npm run seed:local first');
  return result.idToken;
}

async function api<T>(path: string, token: string, body?: unknown, key?: string): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = (await response.json()) as T & { error?: { code: string } };
  if (!response.ok) throw new Error(`local api smoke failed: ${path} ${response.status} ${result.error?.code}`);
  return result;
}

const admin = await login('admin@example.test');
const player = await login('player@example.test');
await api('/me/initialize', player, { displayName: 'Demo Player' });
const initial = await api<{ world: { id: string; status: string } }>('/world', player);
if (initial.world.status !== 'idle') throw new Error('finish the current local clock job before running smoke:local');
const market = await api<{ instruments: unknown[] }>('/market', player);
const input = { worldId: initial.world.id, instrumentId: 'AAPL', side: 'buy', amountILS: '10000' };
const orderKey = '11111111-1111-4111-8111-111111111111';
type OrderResult = { order: { id: string; executeAt: string; status: string } };
const first = await api<OrderResult>('/orders', player, input, orderKey);
const retry = await api<OrderResult>('/orders', player, input, orderKey);
if (first.order.id !== retry.order.id) throw new Error('idempotency failed');
type JobResult = { status: string; job: { id: string } | null };
// the admin screen does the same: jump to the next market event, then step the saved job.
await api(
  '/admin/clock/configure',
  admin,
  { worldId: initial.world.id, action: 'set', target: first.order.executeAt },
  '22222222-2222-4222-8222-222222222222',
);
let job = await api<{ world: JobResult }>('/world', admin).then(result => result.world);
let steps = 0;
while (job.status !== 'idle' || job.job) {
  job = await api<JobResult>(`/admin/clock/jobs/${job.job!.id}/step`, admin, {});
  if (++steps > 500) throw new Error('clock did not finish within the smoke-test bound');
}
const orders = await api<{ orders: { id: string; status: string }[] }>('/orders', player);
const order = orders.orders.find(item => item.id === first.order.id);
if (order?.status !== 'executed') throw new Error('the order was not executed');
const board = await api<{ total: number }>('/leaderboard', player);
const portfolio = await api<{ summary: { availableCashILS: string; holdings: unknown[] } }>('/portfolio', player);
await api('/daily-review/view', player, {});
process.stdout.write(
  `${JSON.stringify({ environment: 'local auth + firestore emulators over http', instruments: market.instruments.length, duplicateOrderPrevented: true, execution: order.status, clock: job.status, clockSteps: steps, leaderboardPlayers: board.total, availableCashILS: portfolio.summary.availableCashILS, holdings: portfolio.summary.holdings.length }, null, 2)}\n`,
);
