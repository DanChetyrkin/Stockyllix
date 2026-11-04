import assert from 'node:assert/strict';
import test from 'node:test';
import { darkPalette, isThemePreference, lightPalette, resolveTheme } from '../src/config/theme.ts';

test('automatic appearance follows real Israel time at the evening and morning boundaries', () => {
  assert.equal(resolveTheme('auto', new Date('2026-11-03T17:59:59Z')), 'light');
  assert.equal(resolveTheme('auto', new Date('2026-11-03T18:00:00Z')), 'dark');
  assert.equal(resolveTheme('auto', new Date('2026-11-04T04:59:59Z')), 'dark');
  assert.equal(resolveTheme('auto', new Date('2026-11-04T05:00:00Z')), 'light');
});

test('Israel summer time changes the UTC boundary without changing the local rule', () => {
  assert.equal(resolveTheme('auto', new Date('2026-07-03T16:59:59Z')), 'light');
  assert.equal(resolveTheme('auto', new Date('2026-07-03T17:00:00Z')), 'dark');
  assert.equal(resolveTheme('auto', new Date('2026-07-04T03:59:59Z')), 'dark');
  assert.equal(resolveTheme('auto', new Date('2026-07-04T04:00:00Z')), 'light');
});

test('manual choices override the clock and only known preferences are accepted', () => {
  assert.equal(resolveTheme('light', new Date('2026-11-03T22:00:00Z')), 'light');
  assert.equal(resolveTheme('dark', new Date('2026-11-03T10:00:00Z')), 'dark');
  for (const value of ['auto', 'light', 'dark']) assert.equal(isThemePreference(value), true);
  for (const value of [null, '', 'system', {}, 0]) assert.equal(isThemePreference(value), false);
});

function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

test('core text, status and button colors remain readable in both appearances', () => {
  for (const palette of [lightPalette, darkPalette]) {
    for (const [foreground, background] of [
      ['ink', 'paper'], ['muted', 'paper'], ['ink', 'background'], ['muted', 'background'],
      ['green', 'mint'], ['red', 'redBg'], ['amber', 'amberBg'],
      ['onPrimary', 'primary'], ['onDanger', 'danger'], ['mutedOnDark', 'dark'],
    ]) {
      const values = [luminance(palette[foreground]), luminance(palette[background])].sort((a, b) => b - a);
      assert.ok((values[0] + 0.05) / (values[1] + 0.05) >= 4.5, `${foreground} on ${background}`);
    }
  }
});
