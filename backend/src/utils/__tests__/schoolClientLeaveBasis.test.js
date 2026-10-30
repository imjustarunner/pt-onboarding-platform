import { describe, it, expect } from 'vitest';
import { classifySchoolServiceEvidence, isPayableSchoolReportRow, schoolBasisFromApprovedLine } from '../schoolClientLeaveBasis.js';

const schools = [{ id: 10, name: 'Maple Elementary' }, { id: 11, name: 'Oak Elementary' }];
const locations = [{ id: 21, name: 'Maple Elementary', school_organization_id: 10, place_of_service: '03', location_kind: 'school' }, { id: 22, name: 'Main Office', place_of_service: '11', location_kind: 'office_pos' }];
const client = { id: 7, organization_id: 10 };
const classify = args => classifySchoolServiceEvidence({ client, schoolOrganizations: schools, schoolLocations: locations, ...args });

describe('dated school-client service evidence', () => {
  it('requires a matched school-affiliated client and actual row school evidence', () => {
    expect(classify({ placeOfService: '03' })).toMatchObject({ schoolService: true, evidenceStatus: 'verified_school', schoolOrganizationId: 10 });
    expect(classify({ location: ' MAPLE elementary ' })).toMatchObject({ schoolService: true, locationId: 21 });
    expect(classify({})).toMatchObject({ schoolService: false, evidenceStatus: 'review', reasonCodes: ['school_service_location_missing'] });
  });
  it('does not count a school client seen at an office or via non-school telehealth', () => {
    expect(classify({ placeOfService: '11', location: 'Main Office' })).toMatchObject({ schoolService: false, evidenceStatus: 'excluded' });
    expect(classify({ placeOfService: '10' })).toMatchObject({ schoolService: false, evidenceStatus: 'excluded' });
    expect(classify({ location: 'Main Office' })).toMatchObject({ schoolService: false, evidenceStatus: 'excluded' });
  });
  it('does not turn an office-only client into a school client from POS alone', () => {
    expect(classify({ client: { id: 8, organization_id: 2, client_type: 'clinical' }, placeOfService: '03' })).toMatchObject({ schoolService: false, evidenceStatus: 'excluded', reasonCodes: ['client_has_no_school_affiliation'] });
    expect(classify({ client: { id: 8, client_type: 'school' }, placeOfService: '03' })).toMatchObject({ schoolService: false, evidenceStatus: 'review', reasonCodes: ['school_client_affiliation_missing'] });
  });
  it('keeps inconsistent or ambiguous service sites in review', () => {
    expect(classify({ placeOfService: '11', location: 'Maple Elementary' })).toMatchObject({ schoolService: false, evidenceStatus: 'review' });
    expect(classify({ placeOfService: '03', location: 'Main Office' })).toMatchObject({ schoolService: false, evidenceStatus: 'review' });
    expect(classify({ location: 'Oak Elementary' })).toMatchObject({ schoolService: false, evidenceStatus: 'review', reasonCodes: ['client_school_location_conflict'] });
    expect(classify({ location: 'Shared Campus', schoolLocations: [{ id: 1, name: 'Shared Campus', school_organization_id: 10 }, { id: 2, name: 'Shared Campus', school_organization_id: 11 }] })).toMatchObject({ schoolService: false, evidenceStatus: 'review' });
  });
  it('does not select a client when identity matching is incomplete', () => {
    expect(classify({ client: null, placeOfService: '03' })).toMatchObject({ schoolService: false, evidenceStatus: 'review', reasonCodes: ['client_identity_not_matched'] });
    expect(classify({ client: null, placeOfService: '11' })).toMatchObject({ schoolService: false, evidenceStatus: 'excluded' });
  });
  it('accepts an active additional school affiliation while rejecting foreign catalog IDs', () => {
    expect(classify({ client: { id: 7, organization_id: 2, schoolOrganizationIds: [10] }, placeOfService: '03' }).schoolService).toBe(true);
    expect(classify({ client: { id: 7, schoolOrganizationIds: [999] }, placeOfService: '03' }).schoolService).toBe(false);
  });
});

it('counts finalized or expressly payable draft rows, not missing notes or unpaid drafts', () => {
  expect(isPayableSchoolReportRow({ note_status: 'FINALIZED' })).toBe(true);
  expect(isPayableSchoolReportRow({ note_status: 'DRAFT', draft_payable: 1 })).toBe(true);
  expect(isPayableSchoolReportRow({ note_status: 'DRAFT', draft_payable: 0 })).toBe(false);
  expect(isPayableSchoolReportRow({ note_status: 'NO_NOTE' })).toBe(false);
});
it('uses approved clinical credits and H-code equivalents with each allowance once', () => {
  const clinical = schoolBasisFromApprovedLine({ payType: 'credit', hourEquivalent: .75, autoIndirectHours: .5 });
  expect(clinical).toMatchObject({ basisHours: .9, directServiceHours: .75, automaticIndirectHours: 0 });
  expect(clinical.clinicalAdministrativeEquivalentHours).toBeCloseTo(.15);
  expect(schoolBasisFromApprovedLine({ payType: 'hcode', hourEquivalent: 1, autoIndirectHours: 12 / 60 }).basisHours).toBe(1.2);
  expect(schoolBasisFromApprovedLine({ payType: 'flat', hourEquivalent: 0 }).basisHours).toBe(0);
  expect(schoolBasisFromApprovedLine({ payType: 'support_activity', hourEquivalent: 2 }).basisHours).toBe(0);
  expect(() => schoolBasisFromApprovedLine({ payType: 'unknown', hourEquivalent: 1 })).toThrow('mapping');
});
