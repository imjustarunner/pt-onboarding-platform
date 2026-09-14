import test from 'node:test';
import assert from 'node:assert/strict';
import clinicalPool from '../../config/clinicalDatabase.js';
import ClinicalNote from '../../models/clinical/ClinicalNote.model.js';

test('signed Note Aid intakes satisfy the plan gate using scoped, non-deleted signed notes', async (t) => {
  let rows = [];
  const execute = t.mock.method(clinicalPool, 'execute', async (sql, params) => {
    assert.deepEqual(params, [7, 202]);
    assert.match(sql, /n\.agency_id = \? AND n\.client_id = \? AND n\.is_deleted = 0/);
    assert.match(sql, /n\.provider_signed_at IS NOT NULL/);
    assert.match(sql, /= '90791'/);
    assert.match(sql, /clinical_h0031_intake/);
    return [rows];
  });
  assert.equal(await ClinicalNote.hasSignedIntakeForClient({ agencyId: 7, clientId: 202 }), false);
  rows = [{ id: 81 }];
  assert.equal(await ClinicalNote.hasSignedIntakeForClient({ agencyId: 7, clientId: 202 }), true);
  assert.equal(execute.mock.callCount(), 2);
});
