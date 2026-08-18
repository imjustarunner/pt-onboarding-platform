import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSchoolStaffTemporaryPassword } from '../schoolStaffTempPassword.js';

describe('resolveSchoolStaffTemporaryPassword', () => {
  it('is defined and accepts a custom password for admins', () => {
    const out = resolveSchoolStaffTemporaryPassword({
      actorRole: 'admin',
      requestedPassword: 'TempPass9'
    });
    assert.equal(out.ok, true);
    assert.equal(out.password, 'TempPass9');
  });

  it('ignores a requested password for school staff actors', () => {
    const out = resolveSchoolStaffTemporaryPassword({
      actorRole: 'school_staff',
      requestedPassword: 'TempPass9'
    });
    assert.equal(out.ok, true);
    assert.equal(out.password, null);
  });
});
