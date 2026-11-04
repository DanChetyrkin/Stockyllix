import assert from 'node:assert/strict';
import { test } from 'node:test';
import { playerDisplayName, startingPlayerName } from '../src/utils/player-name.ts';

test('uses the signed-in identity immediately while portfolio data is loading', () => {
  assert.equal(playerDisplayName({ accountName: 'Dan', email: 'dan@example.test' }), 'Dan');
  assert.equal(playerDisplayName({ email: 'dan@example.test' }), 'dan');
  assert.equal(playerDisplayName({}), undefined);
});

test('respects saved profile names and replaces only a legacy account placeholder', () => {
  assert.equal(playerDisplayName({ portfolioName: 'New name', accountName: 'Old name' }), 'New name');
  assert.equal(playerDisplayName({ portfolioName: 'Investor', accountName: 'Dan' }), 'Dan');
  assert.equal(playerDisplayName({ portfolioName: 'Investor', accountName: 'Investor' }), 'Investor');
});

test('preserves the full chosen name and trims surrounding spaces', () => {
  assert.equal(playerDisplayName({ portfolioName: '  דן צ׳טירקין  ', accountName: 'Dan' }), 'דן צ׳טירקין');
});

test('a new portfolio name always fits the server rule of 2 to 40 characters', () => {
  assert.equal(startingPlayerName('  Dan  ', 'dan@example.test'), 'Dan');
  assert.equal(startingPlayerName(null, 'dan@example.test'), 'dan');
  assert.equal(startingPlayerName('D', null), 'Investor');
  assert.equal(startingPlayerName(null, 'x@example.test'), 'Investor');
  assert.equal(startingPlayerName('a'.repeat(60), null).length, 40);
});
