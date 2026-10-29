import test from 'node:test';
import assert from 'node:assert/strict';
import { excludeFamilyClinicalWorkspace } from '../supportContentAccess.middleware.js';
for (const role of ['client_guardian', 'guardian', 'client']) {
  test(`${role} cannot bypass private enrollment access through staff chart routes`, () => {
    let continued = false, status, body;
    const res = { status(code) { status = code; return this; }, json(value) { body = value; } };
    excludeFamilyClinicalWorkspace({ user: { id: 12, role } }, res, () => { continued = true; });
    assert.equal(continued, false);
    assert.equal(status, 403);
    assert.equal(body.error.code, 'FAMILY_CLINICAL_WORKSPACE_RESTRICTED');
  });
}
test('staff still proceeds to the existing assignment and agency checks', () => {
  for (const role of ['provider', 'provider_plus', 'admin', 'super_admin', 'school_staff']) {
    let continued = false;
    excludeFamilyClinicalWorkspace({ user: { id: 12, role } }, {}, () => { continued = true; });
    assert.equal(continued, true);
  }
});
