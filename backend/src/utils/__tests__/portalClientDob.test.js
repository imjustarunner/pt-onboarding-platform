import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDobInput, loadLinkedClientDobs } from '../portalClientDob.js';

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

  it('loads guardian and self relationships through active links without the nonexistent clients.user_id column', async () => {
    const rows = await loadLinkedClientDobs(42, {
      async execute(sql, args) {
        assert.match(sql, /JOIN client_guardians/);
        assert.match(sql, /cg\.access_enabled = 1/);
        assert.doesNotMatch(sql, /c\.user_id/);
        assert.deepEqual(args, [42]);
        return [[
          { id: 1, full_name: 'First demo child', date_of_birth: new Date('2015-06-15T00:00:00Z') },
          { id: 2, full_name: 'Second demo child', date_of_birth: '2017-08-20' }
        ]];
      }
    });
    assert.deepEqual(rows.map(r => r.dob), ['2015-06-15', '2017-08-20']);
  });
});
