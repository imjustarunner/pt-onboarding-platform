import { expect, it } from 'vitest';
import { describeSignedSchoolRoiDocuments } from '../schoolRoiEvidence.js';
const doc = (id, guardian, school, signedAt = '2026-11-12T20:00:00Z') => ({ id, guardian_user_id: guardian,
  submission_school_organization_id: school, signed_at: signedAt, intake_submission_id: id + 100,
  audit_trail: { signerName: 'Same display name' } });

it('supersedes only an older signed record by the same attributed guardian and school', () => {
  const result = describeSignedSchoolRoiDocuments([doc(11, 1, 451), doc(12, 1, 451, '2026-11-13T20:00:00Z'), doc(13, 2, 451)], 451);
  expect(result.map(r => [r.id, r.evidence_state, r.superseded_by_document_id])).toEqual([
    [11, 'superseded', 12], [12, 'latest_signed', null], [13, 'latest_signed', null]
  ]);
});
it('does not infer signer identity from matching names or make another school current', () => {
  const result = describeSignedSchoolRoiDocuments([doc(11, 1, 451), doc(12, null, 451), doc(13, 1, 452), doc(14, 1, null)], 451);
  expect(result.map(r => r.evidence_state)).toEqual(['latest_signed', 'historical', 'historical_other_school', 'historical']);
  expect(result.every(r => !('access_level' in r))).toBe(true);
});
it('preserves signed evidence and uses the record ID to resolve equal signature times', () => {
  const input = [Object.freeze(doc(12, 1, 451)), Object.freeze(doc(11, 1, 451))];
  const result = describeSignedSchoolRoiDocuments(input, 451);
  expect(result[0].evidence_state).toBe('latest_signed'); expect(result[1].superseded_by_document_id).toBe(12);
  expect(input[0]).not.toHaveProperty('evidence_state'); expect(input[1].audit_trail.signerName).toBe('Same display name');
});
it('keeps unattributed or invalid dated evidence historical instead of inventing a latest release', () => {
  expect(describeSignedSchoolRoiDocuments([doc(1, 1, 451, 'unavailable')], 451)[0].evidence_state).toBe('historical');
});
