import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../../config/database.js';
import {
  getEffectiveSchoolStaffRoiState,
  schoolStaffCanOpenClient,
  schoolStaffCanViewClientDocuments
} from '../../models/ClientSchoolStaffRoiAccess.model.js';

const nextYear = `${new Date().getFullYear() + 1}-06-01`;

describe('getEffectiveSchoolStaffRoiState', () => {
  it('retains the member’s required logistics overview without granting clinical documents after an explicit denial', () => {
    const record = { access_level: 'roi_docs', is_active: 1, guardian_consent: { effectiveDecision: 'none' } };
    assert.equal(getEffectiveSchoolStaffRoiState(record, nextYear, { schoolStaffInOrg: true }), 'denied');
    assert.equal(schoolStaffCanOpenClient(record, nextYear, { schoolStaffInOrg: true }), true);
    assert.equal(schoolStaffCanOpenClient(record, nextYear, { schoolStaffInOrg: false }), false);
    assert.equal(schoolStaffCanViewClientDocuments(record, nextYear, { schoolStaffInOrg: true }), false);
  });
  it('keeps a No ROI grant labeled No ROI even when the client ROI date is current', () => {
    const state = getEffectiveSchoolStaffRoiState(
      { access_level: 'packet', is_active: 1 },
      nextYear,
      { schoolStaffInOrg: true }
    );
    assert.equal(state, 'packet');
    assert.equal(
      schoolStaffCanOpenClient({ access_level: 'packet', is_active: 1 }, nextYear, { schoolStaffInOrg: true }),
      true
    );
  });

  it('keeps a missing grant as No ROI for school members and still opens the overview', () => {
    assert.equal(
      getEffectiveSchoolStaffRoiState(null, nextYear, { schoolStaffInOrg: true }),
      'none'
    );
    assert.equal(
      schoolStaffCanOpenClient(null, nextYear, { schoolStaffInOrg: true }),
      true
    );
    assert.equal(
      schoolStaffCanOpenClient(null, nextYear, { schoolStaffInOrg: false }),
      false
    );
  });
});

after(async () => {
  try {
    await pool.end();
  } catch {
    // ignore
  }
});
