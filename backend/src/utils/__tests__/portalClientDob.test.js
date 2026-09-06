import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDobInput } from '../portalClientDob.js';

describe('portalClientDob', () => {
  it('normalizes ISO and US dates to YYYY-MM-DD', () => {
    assert.equal(normalizeDobInput('2016-04-05'), '2016-04-05');
    assert.equal(normalizeDobInput('4/5/2016'), '2016-04-05');
    assert.equal(normalizeDobInput('04-05-2016'), '2016-04-05');
  });

  it('returns null for empty or invalid values', () => {
    assert.equal(normalizeDobInput(''), null);
    assert.equal(normalizeDobInput('not-a-date'), null);
  });
});
