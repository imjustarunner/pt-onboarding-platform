import { describe, it, expect } from 'vitest';
import { isClinicalClient, isMentalHealthWorkspace, clinicalReturnPath } from '../clinicalWorkspace.js';
import { buildNoteAidQuery } from '../noteAidLaunch.js';

describe('clinical workspace presentation boundaries', () => {
  it.each(['learning', 'basic_nonclinical', 'tutoring'])('keeps %s clients out of clinical branding', client_type => {
    expect(isClinicalClient({ client_type, organization_type: 'school' })).toBe(false);
    expect(isMentalHealthWorkspace({ client: { client_type }, tenant: { organization_type: 'clinical' } })).toBe(false);
  });
  it.each(['clinical', 'school'])('brands %s client charts as clinical', client_type => {
    expect(isClinicalClient({ client_type })).toBe(true);
  });
  it('uses a selected service before the clinical tenant or client', () => {
    expect(isMentalHealthWorkspace({ client: { client_type: 'clinical' }, practiceCategory: 'tutoring' })).toBe(false);
    expect(isMentalHealthWorkspace({ client: { client_type: 'clinical' }, learningAid: true })).toBe(false);
    expect(isMentalHealthWorkspace({ practiceCategory: 'mental_health' })).toBe(true);
    expect(isMentalHealthWorkspace({ tenant: { organization_type: 'learning' } })).toBe(false);
    expect(isMentalHealthWorkspace({})).toBe(false);
    expect(isMentalHealthWorkspace({ client: { client_type: 'unknown' }, tenant: { organization_type: 'clinical' } })).toBe(false);
  });
  it('preserves schedule session and tutoring context in documentation links', () => {
    expect(buildNoteAidQuery({ clientId: 7, clinicalSessionId: 8, draftId: 9, practiceCategory: 'tutoring' }))
      .toEqual({ clientId: '7', clinicalSessionId: '8', draftId: '9', practiceCategory: 'tutoring' });
  });
  it('returns to the original school or schedule view', () => {
    expect(clinicalReturnPath({ previous: '/itsco/school/12?tab=roster', current: '/itsco/admin/clients/7' })).toBe('/itsco/school/12?tab=roster');
    expect(clinicalReturnPath({ previous: '/itsco/dashboard?tab=schedule', current: '/itsco/note-aid' })).toBe('/itsco/dashboard?tab=schedule');
  });
  it.each(['https://example.com', '//example.com', '/itsco/note-aid', '/itsco/admin/clients/7', '/itsco/login', '/itsco/counseling/session/8'])('rejects unsafe or recursive return target %s', previous => {
    expect(clinicalReturnPath({ previous, slug: 'itsco' })).toBe('/itsco/dashboard');
  });
});
