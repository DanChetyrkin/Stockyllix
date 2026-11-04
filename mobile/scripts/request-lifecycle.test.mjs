import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestCoordinator, resourceView } from '../src/hooks/request-state.ts';
import { ApiError, requestDeadlineMs, requestJson } from '../src/api/http.ts';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('unchanged world polls reuse one slow request instead of discarding its eventual result', async () => {
  const requests = new RequestCoordinator();
  const response = deferred();
  let calls = 0;
  let published = null;
  const load = () => requests.run('alice/world-1/7/portfolio', async (signal, isCurrent) => {
    calls += 1;
    const result = await response.promise;
    if (isCurrent()) published = result;
    assert.equal(signal.aborted, false);
  });
  const first = load();
  await Promise.resolve();
  for (let poll = 0; poll < 5; poll += 1) assert.equal(load(), first);
  response.resolve({ value: 1_000_000 });
  await first;
  assert.equal(calls, 1);
  assert.deepEqual(published, { value: 1_000_000 });
});

test('a different user, path or revision cancels the old request and rejects stale publication', async () => {
  const requests = new RequestCoordinator();
  const old = deferred();
  const fresh = deferred();
  let oldSignal;
  const published = [];
  const first = requests.run('alice/world-1/7/portfolio', async (signal, isCurrent) => {
    oldSignal = signal;
    const result = await old.promise;
    if (isCurrent()) published.push(result);
  });
  await Promise.resolve();
  const second = requests.run('bob/world-2/1/market', async (_signal, isCurrent) => {
    const result = await fresh.promise;
    if (isCurrent()) published.push(result);
  });
  assert.equal(oldSignal.aborted, true);
  old.resolve('private alice result');
  await first;
  fresh.resolve('current bob result');
  await second;
  assert.deepEqual(published, ['current bob result']);
});

test('failure and cancellation release the request slot for a real retry', async () => {
  const requests = new RequestCoordinator();
  await assert.rejects(requests.run('same-key', async () => { throw new Error('offline'); }), /offline/);
  assert.equal(await requests.run('same-key', async () => 'retried'), 'retried');
  const pending = deferred();
  let signal;
  const old = requests.run('same-key', async (currentSignal, isCurrent) => {
    signal = currentSignal;
    await pending.promise;
    return isCurrent();
  });
  await Promise.resolve();
  requests.cancel();
  assert.equal(signal.aborted, true);
  pending.resolve();
  assert.equal(await old, false);
  assert.equal(await requests.run('same-key', async () => 'focused again'), 'focused again');
});

const scope = 'alice/world-1/portfolio';
const cached = { scope, data: { value: 1_000_000 } };
const loading = { scope, loading: true, error: null };

test('a paused world retains completed data without an endless initial spinner', () => {
  const paused = resourceView({ scope, result: cached, request: loading, ready: false, pauseReason: 'World advancing', prerequisiteError: null });
  assert.deepEqual(paused, { data: cached.data, loading: false, error: null, paused: true, pauseReason: 'World advancing' });
  const initial = resourceView({ scope, result: null, request: loading, ready: false, pauseReason: 'World advancing', prerequisiteError: null });
  assert.equal(initial.loading, false);
  assert.equal(initial.paused, true);
});

test('connection failures and explicit retries have bounded visible states while keeping prior data', () => {
  const disconnected = resourceView({ scope, result: null, request: loading, ready: false, pauseReason: 'Connecting', prerequisiteError: 'API server unavailable' });
  assert.equal(disconnected.error, 'API server unavailable');
  assert.equal(disconnected.loading, false);
  const retry = resourceView({ scope, result: cached, request: loading, ready: true, pauseReason: null, prerequisiteError: null });
  assert.equal(retry.loading, true);
  assert.deepEqual(retry.data, cached.data);
  const failed = resourceView({ scope, result: cached, request: { scope, loading: false, error: 'API server unavailable' }, ready: true, pauseReason: null, prerequisiteError: null });
  assert.deepEqual(failed.data, cached.data);
  assert.equal(failed.error, 'API server unavailable');
});

test('cached data and errors never cross a user or world scope', () => {
  const current = resourceView({ scope: 'bob/world-2/portfolio', result: cached, request: { ...loading, error: 'Alice error' }, ready: true, pauseReason: null, prerequisiteError: null });
  assert.equal(current.data, null);
  assert.equal(current.error, null);
  assert.equal(current.loading, false);
});

test('HTTP requests preserve their auth, body and idempotency key without automatic mutation retries', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls += 1;
    assert.equal(url, 'https://api.example/orders');
    assert.equal(options.headers.Authorization, 'Bearer token');
    assert.equal(options.headers['Idempotency-Key'], 'stable-key');
    assert.equal(options.method, 'POST');
    assert.equal(options.body, '{"amountILS":"100"}');
    return new Response('{"order":{"status":"pending"}}', { status: 201 });
  });
  assert.deepEqual(await requestJson('https://api.example/orders', async () => 'token', { method: 'POST', requestKey: 'stable-key', body: { amountILS: '100' } }), { order: { status: 'pending' } });
  assert.equal(calls, 1);
});

test('transport errors identify the API server rather than assuming the user has no internet', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(requestJson('https://api.example/world', async () => 'token'), cause => {
    assert.equal(cause.code, 'NETWORK_ERROR');
    assert.match(cause.message, /API server/);
    assert.doesNotMatch(cause.message, /Check your connection/);
    return true;
  });
});

test('external cancellation is distinct from timeout and can abort a pending auth token refresh', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls += 1; return new Response('{}'); });
  const already = new AbortController();
  already.abort();
  await assert.rejects(requestJson('https://api.example/world', async () => { throw new Error('must not request a token'); }, { signal: already.signal }), { code: 'CANCELLED' });
  const controller = new AbortController();
  const pending = requestJson('https://api.example/world', () => new Promise(() => {}), { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { code: 'CANCELLED' });
  assert.equal(calls, 0);
});

test('a stalled auth token is bounded by the local deadline while public production keeps its cold-start budget', async t => {
  assert.equal(requestDeadlineMs('http://localhost:3000/api', true), 15_000);
  assert.equal(requestDeadlineMs('http://192.168.1.20:3000/api', true), 15_000);
  assert.equal(requestDeadlineMs('http://[::1]:3000/api', true), 15_000);
  assert.equal(requestDeadlineMs('http://localhost:3000/api', false), 75_000);
  assert.equal(requestDeadlineMs('https://stockyllix.onrender.com/api', true), 75_000);
  assert.equal(requestDeadlineMs('https://stockyllix.onrender.com/api', false), 75_000);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let fetched = false;
  t.mock.method(globalThis, 'fetch', async () => { fetched = true; return new Response('{}'); });
  const pending = requestJson('http://localhost:3000/api/world', () => new Promise(() => {}), {}, requestDeadlineMs('http://localhost:3000/api', true));
  const rejected = assert.rejects(pending, { code: 'TIMEOUT' });
  t.mock.timers.tick(15_000);
  await rejected;
  assert.equal(fetched, false);
});

test('HTTP failures retain server codes and request IDs, while malformed success bodies are explicit errors', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('{"error":{"code":"WORLD_ADVANCING","message":"Paused","requestId":"request-1"}}', { status: 423 }));
  await assert.rejects(requestJson('https://api.example/world', async () => 'token'), cause => cause instanceof ApiError && cause.code === 'WORLD_ADVANCING' && cause.status === 423 && cause.requestId === 'request-1');
  globalThis.fetch = async () => new Response('not JSON', { status: 200 });
  await assert.rejects(requestJson('https://api.example/world', async () => 'token'), { code: 'INVALID_RESPONSE', status: 502 });
});
