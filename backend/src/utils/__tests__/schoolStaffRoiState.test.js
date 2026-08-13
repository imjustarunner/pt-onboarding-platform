import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../../config/database.js';
import {
  getEffectiveSchoolStaffRoiState,
  schoolStaffCanOpenClient
} from '../../models/ClientSchoolStaffRoiAccess.model.js';

const nextYear = `${new Date().getFullYear() + 1}-06-01`;

describe('getEffectiveSchoolStaffRoiState', () => {
  it('upgrades packet / No ROI on file to ROI Active when the client ROI is current', () => {
    const state = getEffectiveSchoolStaffRoiState(
      { access_level: 'packet', is_active: 1 },
      nextYear
    );
    assert.equal(state, 'limited');
    assert.equal(
      schoolStaffCanOpenClient({ access_level: 'packet', is_active: 1 }, nextYear),
      true
    );
  });

  it('keeps packet locked when the client ROI is expired or missing', () => {
    assert.equal(
      getEffectiveSchoolStaffRoiState({ access_level: 'packet', is_active: 1 }, null),
      'packet'
    );
    assert.equal(
      schoolStaffCanOpenClient({ access_level: 'packet', is_active: 1 }, null),
      false
    );
  });

  it('treats no record as ROI Active for school staff in the org when ROI is current', () => {
    assert.equal(
      getEffectiveSchoolStaffRoiState(null, nextYear, { schoolStaffInOrg: true }),
      'limited'
    );
    assert.equal(
      getEffectiveSchoolStaffRoiState(null, nextYear, { schoolStaffInOrg: false }),
      'none'
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
