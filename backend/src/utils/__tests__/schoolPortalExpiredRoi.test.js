import { after, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../../config/database.js';
import ClientSchoolStaffRoiAccess, { schoolStaffCanOpenClient, getEffectiveSchoolStaffRoiState } from '../../models/ClientSchoolStaffRoiAccess.model.js';
import { schoolStaffCanCollaborateFromState, schoolStaffOwnDocumentsOnly } from '../schoolStaffRoiLabels.js';

const scope = { clientId: 1, schoolOrganizationId: 2, schoolStaffUserId: 3 };
describe('expired school ROI boundaries', () => {
  it('opens expired legacy overviews while keeping missing or revoked grants locked', () => {
    assert.equal(getEffectiveSchoolStaffRoiState(null, '2020-01-01', { schoolStaffInOrg: true }), 'expired');
    assert.equal(getEffectiveSchoolStaffRoiState(null, null, { schoolStaffInOrg: true }), 'none');
    assert.equal(getEffectiveSchoolStaffRoiState({ is_active: false }, '2020-01-01', { schoolStaffInOrg: true }), 'none');
    assert.equal(getEffectiveSchoolStaffRoiState(null, '2020-01-01'), 'none');
  });
  it('permits the overview while denying comments, messages, and document access', async () => {
    mock.method(ClientSchoolStaffRoiAccess, 'resolveSchoolStaffClientAccessState', async () => 'expired');
    assert.equal(schoolStaffCanOpenClient({ access_level: 'roi_docs', is_active: 1 }, '2020-01-01'), true);
    assert.equal(await ClientSchoolStaffRoiAccess.schoolStaffHasActiveRoiAccess(scope), false);
    assert.equal(await ClientSchoolStaffRoiAccess.schoolStaffHasActiveRoiAccess({ ...scope, allowExpiredOverview: true }), true);
    assert.equal(await ClientSchoolStaffRoiAccess.schoolStaffHasActiveRoiAccess({ ...scope, requireDocumentAccess: true, allowExpiredOverview: true }), false);
    assert.equal(schoolStaffCanCollaborateFromState('expired'), false);
    assert.equal(schoolStaffOwnDocumentsOnly('expired'), false);
    mock.restoreAll();
  });
  it('preserves access with current ROI and denies clients with no grant', async () => {
    for (const state of ['none', 'packet', 'limited', 'roi', 'roi_docs']) {
      mock.method(ClientSchoolStaffRoiAccess, 'resolveSchoolStaffClientAccessState', async () => state);
      assert.equal(await ClientSchoolStaffRoiAccess.schoolStaffHasActiveRoiAccess(scope), ['limited', 'roi', 'roi_docs'].includes(state));
      mock.restoreAll();
    }
  });
});
after(async () => { mock.restoreAll(); await pool.end(); });
