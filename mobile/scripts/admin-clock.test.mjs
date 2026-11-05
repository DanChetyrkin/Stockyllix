import test from 'node:test';
import assert from 'node:assert/strict';
import { israelDateTime, parseClockRequest, suggestedGameTime, validCalendarDate, validIsraelDateTime } from '../src/utils/admin-clock.ts';

test('israel fields follow daylight saving independently of the device zone', () => {
  assert.deepEqual(israelDateTime('2026-10-19T13:30:00Z'), { date: '2026-10-19', time: '16:30' });
  assert.deepEqual(israelDateTime('2026-10-26T13:30:00Z'), { date: '2026-10-26', time: '15:30' });
  assert.deepEqual(israelDateTime('2026-10-25T22:00:00Z'), { date: '2026-10-26', time: '00:00' });
});

test('calendar inputs reject impossible days and times rather than normalizing them', () => {
  assert.equal(validCalendarDate('2027-02-29'), false);
  assert.equal(validCalendarDate('2028-02-29'), true);
  assert.equal(validIsraelDateTime({ date: '2027-03-01', time: '23:59' }), true);
  assert.equal(validIsraelDateTime({ date: '2027-03-01', time: '24:00' }), false);
});

test('suggested game time keeps a future minute without proposing a date beyond the covered period', () => {
  const end = '2027-03-28T20:59:59.999Z';
  assert.deepEqual(suggestedGameTime('2027-03-28T20:30:00Z', end), { date: '2027-03-28', time: '23:31' });
  assert.deepEqual(suggestedGameTime('2027-03-28T20:59:30Z', end), { date: '2027-03-28', time: '23:59' });
  assert.deepEqual(suggestedGameTime(end, end), { date: '2027-03-28', time: '23:59' });
});

test('restored requests retain the original world, action, target and idempotency key', () => {
  const request = { key: '12345678-1234-4234-8234-123456789012', worldId: 'test-world', action: 'set', targetIsrael: { date: '2027-03-01', time: '10:00' } };
  assert.deepEqual(parseClockRequest(JSON.stringify(request)), request);
  const legacy = { key: request.key, worldId: request.worldId, action: 'set', target: '2026-10-19T13:30:00Z' };
  assert.deepEqual(parseClockRequest(JSON.stringify(legacy)), legacy);
  assert.equal(parseClockRequest(null), null);
  for (const value of ['{', 'null', '{}', JSON.stringify({ ...request, key: 'bad' }), JSON.stringify({ ...request, target: legacy.target }), JSON.stringify({ ...request, action: 'next_order' })]) assert.throws(() => parseClockRequest(value));
});
