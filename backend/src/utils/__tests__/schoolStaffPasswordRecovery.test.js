import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  NON_AGENCY_RECOVERY_ROLES,
  EXTERNAL_PORTAL_PASSWORD_ROLES,
  userNeedsFirstPasswordSet,
  statusAfterExternalPortalPasswordSet,
  isPasswordResetTokenPurpose
} from '../schoolStaffPasswordRecovery.js';

describe('schoolStaffPasswordRecovery', () => {
  it('includes school_staff in non-agency recovery roles', () => {
    assert.equal(NON_AGENCY_RECOVERY_ROLES.has('school_staff'), true);
    assert.equal(EXTERNAL_PORTAL_PASSWORD_ROLES.has('school_staff'), true);
  });

  it('treats never-set password as first password set', () => {
    assert.equal(userNeedsFirstPasswordSet({ password_hash: null }), true);
    assert.equal(userNeedsFirstPasswordSet({ password_hash: undefined }), true);
  });

  it('treats expired temporary password as first password set', () => {
    const now = Date.parse('2026-08-20T12:00:00Z');
    assert.equal(
      userNeedsFirstPasswordSet(
        {
          password_hash: 'hash',
          temporary_password_hash: 'temp',
          temporary_password_expires_at: '2026-08-19T12:00:00Z'
        },
        now
      ),
      true
    );
  });

  it('does not treat active temporary password alone as needing first set when password_hash exists', () => {
    const now = Date.parse('2026-08-20T12:00:00Z');
    assert.equal(
      userNeedsFirstPasswordSet(
        {
          password_hash: 'hash',
          temporary_password_hash: 'temp',
          temporary_password_expires_at: '2026-08-21T12:00:00Z'
        },
        now
      ),
      false
    );
  });

  it('activates school_staff from PENDING_SETUP after password set', () => {
    assert.equal(
      statusAfterExternalPortalPasswordSet({
        role: 'school_staff',
        status: 'PENDING_SETUP'
      }),
      'ACTIVE_EMPLOYEE'
    );
  });

  it('does not change agency employee statuses via external portal helper', () => {
    assert.equal(
      statusAfterExternalPortalPasswordSet({
        role: 'provider',
        status: 'PENDING_SETUP'
      }),
      null
    );
  });

  it('accepts reset and missing purpose tokens for forgot-password complete', () => {
    assert.equal(isPasswordResetTokenPurpose('reset'), true);
    assert.equal(isPasswordResetTokenPurpose(null), true);
    assert.equal(isPasswordResetTokenPurpose(undefined), true);
    assert.equal(isPasswordResetTokenPurpose('setup'), false);
  });
});
