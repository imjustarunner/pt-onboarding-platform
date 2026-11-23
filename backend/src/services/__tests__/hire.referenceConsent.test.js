import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
import { applicationReferenceConsent } from '../../utils/applicationReferenceConsent.js';
import { resolveHiringReferenceConsent } from '../hiringReferenceConsent.service.js';
const consent = { consentVersion: 1, digitalFormAtInterviewOrOffer: true, referenceContentWaiverAcknowledged: true, referenceReleaseSigned: true };
const profile = { id: 253, job_description_id: 42, references_json: [{email:'reference@example.test'}], references_consent_at: '2026-11-22 19:15:49', references_consent_json: { ...consent, digitalFormAtInterviewOrOffer: false, referenceContentWaiverAcknowledged: false, referenceReleaseSigned: false, referencesWaived: false } };
const data = { referencesConsent: consent, referencesJson: profile.references_json, referenceReleaseSignature: 'SYNTHETIC QA SIGNATURE' };
let db, loadSubmission;
beforeEach(() => {
  db = { execute: vi.fn().mockResolvedValue([[{ id: 1643, submitted_at: '2026-11-22T19:15:49Z' }]]) };
  loadSubmission = vi.fn().mockResolvedValue({ guardian_user_id: 1871, intake_data: data });
});
const resolve = (p = profile) => resolveHiringReferenceConsent({ profile: p, agencyId: 463, candidateUserId: 1871 }, { db, loadSubmission });

it('reads the signed two-page application release at the root, and retains nested packet choices', () => {
  expect(applicationReferenceConsent(data)).toMatchObject(consent);
  expect(applicationReferenceConsent({ responses: { submission: data } })).toMatchObject(consent);
  expect(applicationReferenceConsent({ ...data, referencesConsent: { ...consent, digitalFormAtInterviewOrOffer: false } }).digitalFormAtInterviewOrOffer).toBe(false);
  expect(applicationReferenceConsent({ referencesConsent: consent }).referenceReleaseSigned).toBe(false);
});
it('recovers only the known same-time projection defect from the original signed application', async () => {
  expect(await resolve()).toMatchObject({ allowed: true, source: 'signed_application', submissionId: 1643 });
  expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('l.organization_id=?'), [1871, 463, 42]);
  expect(profile.references_consent_json.digitalFormAtInterviewOrOffer).toBe(false);
});
it('keeps already-authorized profile consent without reading or rewriting an application', async () => {
  expect(await resolve({ ...profile, references_consent_json: consent })).toMatchObject({ allowed: true, source: 'profile' });
  expect(db.execute).not.toHaveBeenCalled();
});
it.each([{ referencesWaived: true }, { revoked: true }, { revokedAt: '2026-11-23' }])('does not recover withdrawn or waived consent (%j)', async change => {
  expect(await resolve({ ...profile, references_consent_json: { ...profile.references_consent_json, ...change } })).toMatchObject({ allowed: false });
  expect(loadSubmission).not.toHaveBeenCalled();
});
it('does not let an older application override a later consent decision', async () => {
  expect(await resolve({ ...profile, references_consent_at: '2026-11-23 19:15:49' })).toMatchObject({ allowed: false });
  expect(loadSubmission).not.toHaveBeenCalled();
});
it('does not apply an older signed release to a different reference contact', async () => {
 expect(await resolve({...profile,references_json:[{email:'different@example.test'}]})).toMatchObject({allowed:false});
});
it.each([
  { guardian_user_id: 999, intake_data: data },
  { guardian_user_id: 1871, intake_data: { referencesConsent: consent } },
  { guardian_user_id: 1871, intake_data: { ...data, referencesWaived: true } },
  { guardian_user_id: 1871, intake_data: { ...data, referencesConsent: { ...consent, digitalFormAtInterviewOrOffer: false } } }
])('denies mismatched, unsigned or unauthorized original evidence', async source => {
  loadSubmission.mockResolvedValue(source);expect(await resolve()).toMatchObject({ allowed: false });
});
