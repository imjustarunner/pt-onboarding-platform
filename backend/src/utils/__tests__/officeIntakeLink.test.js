import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isOfficeEarlyAccountProvisionLink,
  linkLooksLikeOfficeIntake
} from '../officeIntakeLink.js';

describe('officeIntakeLink', () => {
  it('allows office-master and agency-scoped client intake links', () => {
    assert.equal(isOfficeEarlyAccountProvisionLink({ inherits_office_master: 1, scope_type: 'agency' }), true);
    assert.equal(isOfficeEarlyAccountProvisionLink({ inherits_office_master: 0, scope_type: 'agency' }), true);
    assert.equal(linkLooksLikeOfficeIntake({ form_type: 'intake', scope_type: 'agency' }), true);
  });

  it('rejects job applications even though they are agency-scoped', () => {
    assert.equal(linkLooksLikeOfficeIntake({
      form_type: 'job_application',
      scope_type: 'agency',
      inherits_office_master: 0
    }), false);
    assert.equal(isOfficeEarlyAccountProvisionLink({
      form_type: 'job_application',
      scope_type: 'agency'
    }), false);
  });

  it('rejects other non-client agency forms', () => {
    assert.equal(linkLooksLikeOfficeIntake({ form_type: 'medical_records_request', scope_type: 'agency' }), false);
    assert.equal(linkLooksLikeOfficeIntake({ form_type: 'smart_registration', scope_type: 'agency' }), false);
  });

  it('rejects school links even if office flags are mixed in', () => {
    assert.equal(isOfficeEarlyAccountProvisionLink({ inherits_school_master: 1, scope_type: 'agency' }), false);
    assert.equal(isOfficeEarlyAccountProvisionLink({ inherits_office_master: 1, scope_type: 'school' }), false);
    assert.equal(isOfficeEarlyAccountProvisionLink({ scope_type: 'school' }), false);
  });
});
