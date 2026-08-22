import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isOfficeAffiliationRow,
  isSchoolAffiliatedClientRow
} from '../schoolAffiliation.js';

test('office clinical client at agency org is not school-affiliated', () => {
  const row = {
    id: 1,
    client_type: 'clinical',
    agency_id: 2,
    organization_id: 2,
    organization_type: 'agency',
    organization_name: 'ITSCO'
  };
  assert.equal(isOfficeAffiliationRow(row), true);
  assert.equal(isSchoolAffiliatedClientRow(row), false);
});

test('school client with school org is school-affiliated', () => {
  const row = {
    id: 2,
    client_type: 'school',
    agency_id: 2,
    organization_id: 10,
    organization_type: 'school',
    organization_name: 'Sample Elementary'
  };
  assert.equal(isOfficeAffiliationRow(row), false);
  assert.equal(isSchoolAffiliatedClientRow(row), true);
});

test('expired roi date alone does not imply school affiliation for office row', () => {
  const row = {
    id: 3,
    client_type: 'clinical',
    agency_id: 5,
    organization_id: 5,
    organization_type: 'clinical',
    organization_name: 'Office',
    roi_expires_at: '2020-01-01'
  };
  assert.equal(isSchoolAffiliatedClientRow(row), false);
});
