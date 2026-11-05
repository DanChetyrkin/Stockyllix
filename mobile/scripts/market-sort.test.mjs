import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dailyChangeValue, panelAsset, sortMarketAssets } from '../src/utils/market-sort.ts';

const asset = (id, name, dailyChangePct, symbol = id) => ({ id, name, symbol, dailyChangePct });
const ids = assets => assets.map(row => row.id);

test('sorts positive, zero and negative daily changes numerically in both directions', () => {
  const assets = [
    asset('down', 'Down', '-2.1'),
    asset('small', 'Small', '2.5'),
    asset('large', 'Large', '10.01'),
    asset('flat', 'Flat', '0'),
  ];
  assert.deepEqual(ids(sortMarketAssets(assets, 'dailyChange', 'desc')), ['large', 'small', 'flat', 'down']);
  assert.deepEqual(ids(sortMarketAssets(assets, 'dailyChange', 'asc')), ['down', 'flat', 'small', 'large']);
});

test('keeps unavailable and invalid changes last in either direction instead of treating them as zero', () => {
  const assets = [
    asset('missing', 'Missing', null),
    asset('negative', 'Negative', '-1'),
    asset('invalid', 'Invalid', 'NaN'),
    asset('zero', 'Zero', '0'),
    asset('empty', 'Empty', ''),
  ];
  for (const direction of ['asc', 'desc']) {
    const sorted = sortMarketAssets(assets, 'dailyChange', direction);
    assert.deepEqual(ids(sorted.slice(-3)), ['empty', 'invalid', 'missing']);
    assert.deepEqual(new Set(ids(sorted.slice(0, 2))), new Set(['negative', 'zero']));
  }
  for (const value of [null, undefined, '', ' ', 'NaN', 'Infinity', '-Infinity'])
    assert.equal(dailyChangeValue(value), null);
  assert.equal(dailyChangeValue('0'), 0);
});

test('resolves equal changes by name, symbol and id consistently without reversing ties', () => {
  const assets = [asset('b', 'same', '1', 'B'), asset('c', 'Same', '1', 'A'), asset('a', 'Same', '1', 'A')];
  for (const direction of ['asc', 'desc'])
    assert.deepEqual(ids(sortMarketAssets(assets, 'dailyChange', direction)), ['a', 'c', 'b']);
});

test('sorts names in both directions and preserves the input and original asset objects', () => {
  const assets = [asset('z', 'Zebra', '1'), asset('a', 'apple', '2'), asset('b', 'Beta', null)];
  const original = [...assets];
  const sorted = sortMarketAssets(assets, 'name', 'asc');
  assert.deepEqual(ids(sorted), ['a', 'b', 'z']);
  assert.deepEqual(ids(sortMarketAssets(assets, 'name', 'desc')), ['z', 'b', 'a']);
  assert.deepEqual(assets, original);
  assert.equal(sorted[0], assets[1]);
});

test('the order panel follows the visible list unless a request pins its asset', () => {
  const all = [asset('LUMI.TA', 'Bank Leumi', '1'), asset('AMZN', 'Amazon', '2'), asset('AAPL', 'Apple', '3')];
  const us = all.filter(row => !row.id.endsWith('.TA'));
  assert.equal(panelAsset(all, us, null, null).id, 'AMZN');
  assert.equal(panelAsset(all, us, null, 'AAPL').id, 'AAPL');
  assert.equal(panelAsset(all, us, null, 'LUMI.TA').id, 'AMZN');
  assert.equal(panelAsset(all, us, 'LUMI.TA', 'AAPL').id, 'LUMI.TA');
  assert.equal(panelAsset(all, [], null, 'AAPL'), undefined);
});

test('works on empty, single-item and already-filtered lists', () => {
  assert.deepEqual(sortMarketAssets([], 'dailyChange', 'desc'), []);
  const one = asset('one', 'One', null);
  assert.deepEqual(sortMarketAssets([one], 'name', 'desc'), [one]);
  const assets = [asset('TA-one', 'One', '-1'), asset('US-two', 'Two', '9'), asset('TA-three', 'Three', '2')];
  assert.deepEqual(
    ids(
      sortMarketAssets(
        assets.filter(row => row.id.startsWith('TA')),
        'dailyChange',
        'desc',
      ),
    ),
    ['TA-three', 'TA-one'],
  );
});
