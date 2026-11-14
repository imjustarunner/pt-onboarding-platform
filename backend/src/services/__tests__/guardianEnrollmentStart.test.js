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

it('offers the published tutoring form and withholds office enrollment in an explicitly learning-only agency',async()=>{
 const flags={clinicalChartEnabled:false,standardsLearningEnabled:true};
 deps.db.execute.mockResolvedValueOnce([[
  {id:349,agency_id:453,agency_name:'NLU QA',scope_type:'agency',master_channel:'tutoring',language_code:'en',feature_flags:JSON.stringify(flags)},
  {id:353,agency_id:453,agency_name:'NLU QA',scope_type:'agency',master_channel:'office',language_code:'en',feature_flags:flags}
 ]]);
 expect((await enrollmentOptions(owner,deps)).options).toEqual([expect.objectContaining({id:349,channel:'tutoring'})]);
 expect(deps.db.execute.mock.calls[0][0]).toContain('agency_channel_intake_masters');
});

it('limits an explicit other-organization lookup to public published service forms, without granting membership',async()=>{
 const result=await enrollmentOptions(owner,deps,'nlu-qa-demo');
 const [sql,args]=deps.db.execute.mock.calls[0];
 expect(args).toEqual([8,'nlu-qa-demo']);expect(sql).toContain('a.public_availability_enabled=1');expect(sql).toContain('st.is_enabled=1');expect(sql).toContain("il.scope_type='agency'");
 expect(deps.submissions.create).not.toHaveBeenCalled();expect(result.options[0]).not.toHaveProperty('guardian');
});
it('binds a new public organization enrollment to the authenticated family and rechecks its published form',async()=>{
 deps.db.execute.mockImplementation(async sql=>sql.includes('SELECT DISTINCT')?[[{id:355,agency_id:453,agency_slug:'nlu-qa-demo',agency_name:'NLU',master_channel:'tutoring'}]]:[[{id:355,public_key:'tutoring-key'}]]);
 await startGuardianEnrollment({user:owner,linkId:355,subject:'dependent',agencySlug:'nlu-qa-demo'},deps);
 expect(deps.submissions.create).toHaveBeenCalledWith(expect.objectContaining({guardianUserId:8,portalEnrollment:{userId:8,email:owner.email,agencyId:453}}));
 expect(deps.db.execute.mock.calls[0][1]).toEqual([8,'nlu-qa-demo']);
});
