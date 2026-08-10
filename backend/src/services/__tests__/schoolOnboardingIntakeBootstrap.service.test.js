import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSchoolIntakeQrPublicKey } from '../schoolOnboardingIntakeBootstrap.service.js';

test('resolveSchoolIntakeQrPublicKey prefers referralQrPublicKey from custom messages', () => {
  assert.equal(
    resolveSchoolIntakeQrPublicKey({
      public_key: 'row-key',
      custom_messages: JSON.stringify({ referralQrPublicKey: 'template-key' })
    }),
    'template-key'
  );
});

test('resolveSchoolIntakeQrPublicKey falls back to row public_key', () => {
  assert.equal(
    resolveSchoolIntakeQrPublicKey({ public_key: 'row-key' }),
    'row-key'
  );
});
