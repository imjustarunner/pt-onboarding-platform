import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkAccess } from '../accessControl.js';

describe('family portal access', () => {
  it('lets a family account with a password open the dashboard', () => {
    for (const role of ['client_guardian', 'guardian', 'client']) {
      for (const status of ['PENDING_SETUP', 'ACTIVE', 'ACTIVE_EMPLOYEE']) {
        const access = checkAccess({ id: 4, role, status, password_hash: 'hash' });
        assert.equal(access.canAccessDashboard, true, `${role} ${status}`);
        assert.equal(access.canAccessDocuments, true, `${role} ${status}`);
        assert.equal(access.canAccessAdmin, false, `${role} ${status}`);
        assert.equal(access.canAccessTraining, false, `${role} ${status}`);
      }
    }
  });

  it('keeps a family account without a password on the setup gate', () => {
    const access = checkAccess({ id: 4, role: 'client_guardian', status: 'PENDING_SETUP', password_hash: null });
    assert.equal(access.canAccessDashboard, false);
  });

  it('does not open the dashboard for a prospective or archived family account', () => {
    assert.equal(checkAccess({ role: 'client_guardian', status: 'PROSPECTIVE', password_hash: 'hash' }).canAccessDashboard, false);
    assert.equal(checkAccess({ role: 'client', status: 'ARCHIVED', password_hash: 'hash' }).canAccessDashboard, false);
    assert.equal(checkAccess({ role: 'guardian', status: 'INACTIVE_EMPLOYEE', password_hash: 'hash' }).canAccessDashboard, false);
  });

  it('does not let an effective role turn a family account into an administrator', () => {
    const access = checkAccess(
      { id: 4, role: 'client_guardian', status: 'ACTIVE', password_hash: 'hash' },
      { effectiveRole: 'super_admin' }
    );
    assert.equal(access.canAccessDashboard, true);
    assert.equal(access.canAccessAdmin, false);
  });
});
