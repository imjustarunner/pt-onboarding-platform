import test from 'node:test';
import assert from 'node:assert/strict';
import {
  injectIntakeLegalIntoPacketHtml,
  resolveIntakeLegalFromTheme,
  mergeIntakeLegalIntoTheme
} from '../intakeLegalCopy.js';

test('injects or replaces the marked age-of-consent block', () => {
  const html = '<h2>MINOR CONSENT</h2><p>One.</p><p>Two.</p><h2>INFORMED CONSENT</h2>';
  const copy = resolveIntakeLegalFromTheme(null, 'en');
  const next = injectIntakeLegalIntoPacketHtml(html, copy);
  assert.match(next, /intake-legal-resources/);
  assert.match(next, /Colorado/);
  const again = injectIntakeLegalIntoPacketHtml(next, {
    ...copy,
    ageOfConsentNote: 'Updated note'
  });
  assert.match(again, /Updated note/);
  assert.equal((again.match(/<!-- intake-legal-resources -->/g) || []).length, 1);
});

test('theme merge keeps English and Spanish independently', () => {
  const theme = mergeIntakeLegalIntoTheme({}, { ageOfConsentNote: 'EN only' }, 'en');
  const both = mergeIntakeLegalIntoTheme(theme, { ageOfConsentNote: 'ES only' }, 'es');
  assert.equal(resolveIntakeLegalFromTheme(both, 'en').ageOfConsentNote, 'EN only');
  assert.equal(resolveIntakeLegalFromTheme(both, 'es').ageOfConsentNote, 'ES only');
});
