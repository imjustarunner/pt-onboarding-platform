import { describe, expect, it } from 'vitest';
import {
  isNonClientIntakeFormType,
  linkLooksLikeOfficeIntake,
  looksLikeOfficeIntakeFromRoute
} from '../officeIntakeLink.js';

describe('officeIntakeLink', () => {
  it('treats office-master and agency intake packets as office client intake', () => {
    expect(linkLooksLikeOfficeIntake({ inherits_office_master: 1, scope_type: 'agency' })).toBe(true);
    expect(linkLooksLikeOfficeIntake({ form_type: 'intake', scope_type: 'agency' })).toBe(true);
    expect(linkLooksLikeOfficeIntake({ scope_type: 'agency' })).toBe(true);
  });

  it('does not treat job applications as office client intake', () => {
    expect(isNonClientIntakeFormType('job_application')).toBe(true);
    expect(linkLooksLikeOfficeIntake({
      form_type: 'job_application',
      scope_type: 'agency',
      inherits_office_master: 0
    })).toBe(false);
    expect(looksLikeOfficeIntakeFromRoute({
      link: { form_type: 'job_application', scope_type: 'agency' },
      publicKey: '767a0f2ff72471e126a1e69e33bf9e136df47e0e32495257'
    })).toBe(false);
  });

  it('does not treat medical records or other non-client agency forms as office intake', () => {
    expect(linkLooksLikeOfficeIntake({ form_type: 'medical_records_request', scope_type: 'agency' })).toBe(false);
    expect(linkLooksLikeOfficeIntake({ form_type: 'smart_registration', scope_type: 'agency' })).toBe(false);
    expect(linkLooksLikeOfficeIntake({ form_type: 'internal_preferences', scope_type: 'agency' })).toBe(false);
  });

  it('rejects school packets even if office flags are mixed in', () => {
    expect(linkLooksLikeOfficeIntake({ inherits_school_master: 1, scope_type: 'agency' })).toBe(false);
    expect(linkLooksLikeOfficeIntake({ inherits_office_master: 1, scope_type: 'school' })).toBe(false);
    expect(linkLooksLikeOfficeIntake({ scope_type: 'school' })).toBe(false);
  });

  it('uses the office-intake public-key prefix only before the link loads', () => {
    expect(looksLikeOfficeIntakeFromRoute({ publicKey: 'office-intake-2-en-abc' })).toBe(true);
    expect(looksLikeOfficeIntakeFromRoute({ publicKey: '767a0f2ff72471e126a1e69e33bf9e136df47e0e32495257' })).toBe(false);
  });
});
