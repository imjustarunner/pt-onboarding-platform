import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPublicFormUrl,
  loadCompanyEventRegistrationForKiosk
} from '../eventKioskRegistration.util.js';

test('buildPublicFormUrl builds intake and preferences paths', () => {
  const prev = process.env.PUBLIC_INTAKE_BASE_URL;
  process.env.PUBLIC_INTAKE_BASE_URL = 'https://example.org';
  try {
    assert.equal(buildPublicFormUrl('abc123', 'intake'), 'https://example.org/intake/abc123');
    assert.equal(
      buildPublicFormUrl('abc123', 'internal_preferences'),
      'https://example.org/preferences-form/abc123'
    );
  } finally {
    if (prev === undefined) delete process.env.PUBLIC_INTAKE_BASE_URL;
    else process.env.PUBLIC_INTAKE_BASE_URL = prev;
  }
});

test('loadCompanyEventRegistrationForKiosk prefers intake link over external url', async () => {
  const pool = {
    execute: async () => [[{
      id: 5,
      title: 'Summer camp registration',
      public_key: 'deadbeef',
      form_type: 'smart_registration',
      is_active: 1
    }]]
  };
  const out = await loadCompanyEventRegistrationForKiosk(pool, 99, {
    registrationFormUrl: 'https://forms.example.com/manual'
  });
  assert.equal(out.available, true);
  assert.equal(out.links.length, 1);
  assert.equal(out.primary.title, 'Summer camp registration');
  assert.match(out.primary.url, /\/intake\/deadbeef$/);
});
