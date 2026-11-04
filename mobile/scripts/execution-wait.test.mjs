import test from 'node:test';
import assert from 'node:assert/strict';
import { executionDate, executionWait } from '../src/utils/execution-wait.ts';

test('execution estimates use game instants and distinguish paused time from a real wait', () => {
  assert.equal(executionWait('2027-03-01T14:30:00Z', '2027-03-01T08:00:00Z', false), '6h 30m of game time remaining · clock paused.');
  assert.equal(executionWait('2027-03-01T14:30:00Z', '2027-03-01T08:00:00Z', true), 'About 6h 30m at 1× speed.');
  assert.equal(executionWait('2027-03-02T08:01:00Z', '2027-03-01T08:00:00Z', true), 'About 1d 1m at 1× speed.');
});

test('reaching an event does not falsely claim an order was executed', () => {
  assert.match(executionWait('2027-03-01T08:00:00Z', '2027-03-01T08:00:01Z', true), /Waiting for the server/);
  assert.match(executionWait('2027-03-01T09:00:00Z', '2027-03-01T08:00:00Z', true, true), /Waiting for the server/);
  assert.match(executionWait(null, '2027-03-01T08:00:00Z', false), /No execution event/);
  assert.match(executionWait('invalid', '2027-03-01T08:00:00Z', true), /Refresh/);
});

test('Israel execution dates reflect summer and winter offsets without using the device zone', () => {
  assert.match(executionDate('2026-10-19T13:30:00Z'), /19 Oct 2026, 16:30/);
  assert.match(executionDate('2026-10-26T13:30:00Z'), /26 Oct 2026, 15:30/);
  assert.match(executionDate('2027-03-01T14:30:00Z'), /01 Mar 2027, 16:30/);
  assert.equal(executionDate(null), 'No future event');
});
