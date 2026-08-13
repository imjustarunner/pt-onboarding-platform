import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRequestedMasterLanguage } from '../schoolIntakeMasterLanguage.js';

describe('resolveRequestedMasterLanguage', () => {
  it('reads locale from query-like objects', () => {
    assert.equal(resolveRequestedMasterLanguage({ locale: 'es' }, 'en'), 'es');
    assert.equal(resolveRequestedMasterLanguage({ lang: 'en-US' }, 'es'), 'en');
    assert.equal(resolveRequestedMasterLanguage({ formLocale: 'es' }, 'en'), 'es');
  });

  it('falls back to the link language', () => {
    assert.equal(resolveRequestedMasterLanguage({}, 'es'), 'es');
    assert.equal(resolveRequestedMasterLanguage(null, 'en'), 'en');
  });
});
