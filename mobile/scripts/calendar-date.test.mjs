import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarDateAllowed, calendarDateLabel, calendarMonth, calendarMonthAllowed, calendarMonthDays, shiftCalendarMonth } from '../src/utils/calendar-date.ts';

test('calendar grid keeps every date once across leap years and Israel daylight changes', () => {
  const leap = calendarMonthDays('2028-02');
  assert.equal(leap.length, 42);
  assert.equal(leap.filter(Boolean).length, 29);
  assert.equal(new Set(leap.filter(Boolean)).size, 29);
  const october = calendarMonthDays('2026-10');
  assert.equal(october.filter(Boolean).length, 31);
  assert.equal(october[4], '2026-10-01');
  assert.equal(october[28], '2026-10-25');
  assert.equal(calendarDateLabel('2026-10-25'), '25 October 2026');
});

test('range bounds are inclusive and block dates and entire months outside the period', () => {
  assert.equal(calendarDateAllowed('2026-10-18', '2026-10-19', '2026-11-02'), false);
  assert.equal(calendarDateAllowed('2026-10-19', '2026-10-19', '2026-11-02'), true);
  assert.equal(calendarDateAllowed('2026-11-02', '2026-10-19', '2026-11-02'), true);
  assert.equal(calendarDateAllowed('2026-11-03', '2026-10-19', '2026-11-02'), false);
  assert.equal(calendarMonthAllowed('2026-09', '2026-10-19', '2026-11-02'), false);
  assert.equal(calendarMonthAllowed('2026-10', '2026-10-19', '2026-11-02'), true);
  assert.equal(calendarMonthAllowed('2026-12', '2026-10-19', '2026-11-02'), false);
  assert.equal(calendarDateAllowed('2027-02-29'), false);
});

test('navigation rolls years correctly and opening clamps an out-of-period selected date', () => {
  assert.equal(shiftCalendarMonth('2026-12', 1), '2027-01');
  assert.equal(shiftCalendarMonth('2027-01', -1), '2026-12');
  assert.equal(calendarMonth('2027-03-01'), '2027-03');
  assert.equal(calendarMonth('', '2026-10-19', '2026-11-02'), '2026-10');
  assert.equal(calendarMonth('2027-03-01', '2026-10-19', '2026-11-02'), '2026-11');
  assert.throws(() => calendarMonthDays('2027-13'));
});
