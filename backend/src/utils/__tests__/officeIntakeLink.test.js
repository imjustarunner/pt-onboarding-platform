import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isOfficeEarlyAccountProvisionLink } from '../officeIntakeLink.js';

describe('isOfficeEarlyAccountProvisionLink', () => {
  it('allows office-master and agency-scoped links', () => {
    assert.equal(isOfficeEarlyAccountProvisionLink({ inherits_office_master: 1, scope_type: 'agency' }), true);
    assert.equal(isOfficeEarlyAccountProvisionLink({ inherits_office_master: 0, scope_type: 'agency' }), true);
  });

  it('rejects school links even if office flags are mixed in', () => {
    assert.equal(isOfficeEarlyAccountProvisionLink({ inherits_school_master: 1, scope_type: 'agency' }), false);
    assert.equal(isOfficeEarlyAccountProvisionLink({ inherits_office_master: 1, scope_type: 'school' }), false);
    assert.equal(isOfficeEarlyAccountProvisionLink({ scope_type: 'school' }), false);
  });
});
