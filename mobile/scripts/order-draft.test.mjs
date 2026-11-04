import test from 'node:test';
import assert from 'node:assert/strict';
import { isOrderAmount, parseOrderDraft, orderBlockReason } from '../src/utils/order-draft.ts';
import { setTestRealm, usesTestRealm } from '../src/api/realm.ts';

const draft = { key: '12345678-1234-4234-8234-123456789012', input: { worldId: 'test-world', instrumentId: 'AMZN', side: 'buy', amountILS: '50000' } };
const ready = { ready: true, storageProblem: false, worldId: 'test-world', advancing: false, finished: false, hasExecution: true, pendingSell: false, side: 'buy', availableCash: 950000, amount: 50000, units: 0 };

test('a saved retry preserves its original key and amount; malformed storage is detectable', () => {
  assert.deepEqual(parseOrderDraft(JSON.stringify(draft)), draft);
  assert.equal(parseOrderDraft(null), null);
  for (const value of ['{', 'null', '{}', JSON.stringify({ ...draft, key: 'not-a-request-id' }), JSON.stringify({ ...draft, input: { ...draft.input, amountILS: '-1' } })]) assert.throws(() => parseOrderDraft(value));
});

test('order amounts match the server rule: positive shekels with at most two decimals', () => {
  for (const value of ['50000', '0.01', '9999999999.99']) assert.equal(isOrderAmount(value), true);
  for (const value of ['0', '0.00', '-1', '1,000', '1.234', '007', '10000000000', '']) assert.equal(isOrderAmount(value), false);
});

test('an unreadable or old-world local draft has a specific recovery reason', () => {
  assert.match(orderBlockReason({ ...ready, storageProblem: true }), /Check Orders/);
  assert.match(orderBlockReason({ ...ready, savedWorldId: 'older-world' }), /older world/);
  assert.deepEqual(draft.input, { worldId: 'test-world', instrumentId: 'AMZN', side: 'buy', amountILS: '50000' });
});

test('a known request can be retried after data ends, without creating a replacement', () => {
  assert.equal(orderBlockReason({ ...ready, savedWorldId: 'test-world', finished: true, hasExecution: false }), null);
  assert.match(orderBlockReason({ ...ready, savedWorldId: 'test-world', advancing: true }), /synchronizing/);
});

test('cash, per-asset exhaustion, paused processing and reserved sells are explained', () => {
  assert.equal(orderBlockReason(ready), null);
  assert.match(orderBlockReason({ ...ready, amount: 960000 }), /available cash/);
  assert.match(orderBlockReason({ ...ready, hasExecution: false }), /No later execution/);
  assert.match(orderBlockReason({ ...ready, finished: true }), /period has ended/);
  assert.match(orderBlockReason({ ...ready, pendingSell: true, side: 'sell' }), /reserved/);
  assert.match(orderBlockReason({ ...ready, side: 'sell' }), /do not own/);
});

test('test-world routing never carries into a different signed-in account', () => {
  setTestRealm('admin-one', true);
  assert.equal(usesTestRealm('admin-one'), true);
  assert.equal(usesTestRealm('other-player'), false);
  setTestRealm('admin-one', false);
  assert.equal(usesTestRealm('admin-one'), false);
  setTestRealm(null, false);
});
