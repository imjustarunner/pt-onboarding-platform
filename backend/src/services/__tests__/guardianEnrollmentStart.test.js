import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {}, onTableWrite: vi.fn() }));
import { enrollmentOptions, startGuardianEnrollment } from '../guardianEnrollmentStart.service.js';
import { assertPortalEnrollmentIdentity, preservePortalEnrollmentBinding, enrollmentRelationship } from '../../utils/portalEnrollmentBinding.js';

const owner = { id: 8, role: 'client_guardian', email: 'parent@example.com', first_name: 'Pat', last_name: 'Example' };
let deps;
beforeEach(() => {
  deps = { db: { execute: vi.fn(async sql => sql.includes('SELECT DISTINCT') ? [[
    { id: 10, agency_id: 450, agency_name: 'Demo', scope_type: 'agency', language_code: 'en' },
    { id: 11, agency_id: 450, agency_name: 'Demo', scope_type: 'school', language_code: 'es' }
  ]] : [[{ id: 10, public_key: 'office-key' }]]) },
  users: { findById: vi.fn(async () => owner) },
  submissions: { create: vi.fn(async () => ({ id: 30 })), updateById: vi.fn() } };
});
it.each(['self', 'dependent'])('starts a private fresh %s enrollment with the signed-in identity, without enrolling or signing yet', async subject => {
  const result = await startGuardianEnrollment({ user: owner, linkId: 10, subject }, deps);
  expect(result.path).toMatch(/^\/intake\/office-key\?session=[a-f0-9]{48}$/);
  const input = deps.submissions.create.mock.calls[0][0];
  expect(input.guardianUserId).toBe(8);
  expect(input.portalEnrollment).toEqual({ userId: 8, email: owner.email, agencyId: 450 });
  expect(input.status).toBe('started'); expect(input.consentGivenAt).toBeUndefined();
  expect(input.intakeData.clients).toEqual([]);
  expect(input.intakeData.intakeForSelf).toBe(subject === 'self');
  expect(input.intakeData.guardian.email).toBe(owner.email);
  expect(result).not.toHaveProperty('password');
});
it('does not reveal existing dependents or account matches in the enrollment catalog', async () => {
  const result = await enrollmentOptions(owner, deps);
  expect(JSON.stringify(result)).not.toContain(owner.email);
  expect(JSON.stringify(result)).not.toContain('clientId');
});
it.each([
  { user: { id: 9, role: 'support' }, linkId: 10, subject: 'dependent' },
  { user: owner, linkId: 999, subject: 'dependent' },
  { user: owner, linkId: 11, subject: 'self' },
  { user: owner, linkId: 10, subject: 'unknown' }
])('rejects unauthorized or invalid start: %j', async input => {
  await expect(startGuardianEnrollment(input, deps)).rejects.toBeInstanceOf(Error);
  expect(deps.submissions.create).not.toHaveBeenCalled();
});
it('never trusts or replaces the account binding supplied by a public form', () => {
  const binding = { userId: 8, email: owner.email, agencyId: 450 };
  expect(preservePortalEnrollmentBinding(null, { portalEnrollment: binding })).toEqual({});
  expect(preservePortalEnrollmentBinding({ portalEnrollment: binding }, { guardian: { firstName: 'Updated' }, portalEnrollment: { userId: 9 } }))
    .toEqual({ guardian: { firstName: 'Updated' }, portalEnrollment: binding });
});
it('requires the saved session and original email when finishing a portal enrollment', () => {
  const submission = { session_token: 'private-session', intake_data: { portalEnrollment: { userId: 8, email: owner.email } } };
  expect(() => assertPortalEnrollmentIdentity(submission, { guardian: { email: ' Parent@Example.com ' } }, 'private-session')).not.toThrow();
  expect(() => assertPortalEnrollmentIdentity(submission, { guardian: { email: owner.email } }, 'wrong-session')).toThrow();
  expect(() => assertPortalEnrollmentIdentity(submission, { guardian: { email: 'other@example.com' } }, 'private-session')).toThrow();
  expect(() => assertPortalEnrollmentIdentity(submission, { signerEmail: 'other@example.com' }, 'private-session')).toThrow();
});
it('creates self access only for self-enrollment and preserves an existing restricted relationship', () => {
  expect(enrollmentRelationship({ intakeForSelf: true })).toBe('self');
  expect(enrollmentRelationship({ guardian: { relationship: 'Parent' } })).toBe('guardian');
  expect(enrollmentRelationship({ intakeForSelf: true }, { relationship_type: 'proxy', access_enabled: 0 })).toBe('proxy');
});
