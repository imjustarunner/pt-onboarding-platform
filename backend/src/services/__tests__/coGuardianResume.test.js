import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../models/IntakeSubmission.model.js', () => ({ default: { findBySessionToken: vi.fn() } }));
import pool from '../../config/database.js';
import IntakeSubmission from '../../models/IntakeSubmission.model.js';
import { resolveCoGuardianResumeBinding, acceptCoGuardianInvite } from '../coGuardianInvite.service.js';
let invite, submission;
const sessionToken = 'parent-b-saved-session-123456789';
const scope = { agencyId: 2, publicKey: 'school-or-office' };
beforeEach(() => {
 vi.resetAllMocks();
 invite = { id: 18, agency_id: 2, public_key: scope.publicKey, status: 'pending', expires_at: new Date(Date.now()+86400000) };
 submission = { id: 121, co_guardian_invite_id: 18, session_token: sessionToken, status: 'consented', intake_data: { progressSnapshot: { embeddedSmartDisclosure: { signatureData: 'saved-signature' } } } };
 pool.execute.mockImplementation(async sql => [sql.includes('WHERE id = ?') || sql.includes('token_hash') ? [invite] : [{ id: 201, agency_id: 2 }]]);
 IntakeSubmission.findBySessionToken.mockImplementation(async token => token === sessionToken ? submission : null);
});
it('recovers only the saved server-bound invitation without changing answers or signatures', async () => {
 const before = structuredClone(submission);
 expect(await resolveCoGuardianResumeBinding(submission, sessionToken, scope)).toMatchObject({ invite: { id: 18 }, clients: [{ id: 201 }] });
 expect(submission).toEqual(before);
 expect(pool.execute.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
});
it.each(['', 'another-parent-session-123456789', 'short'])('rejects an invalid session before looking up an invitation: %s', async token => {
 await expect(resolveCoGuardianResumeBinding(submission, token, scope)).rejects.toHaveProperty('status', 403);
 expect(pool.execute).not.toHaveBeenCalled();
});
it('cannot manufacture a binding from editable answers or request-supplied IDs', async () => {
 delete submission.co_guardian_invite_id;
 submission.intake_data.guardianSubmission = { kind: 'additional_guardian', inviteId: 18 };
 expect(await resolveCoGuardianResumeBinding(submission, sessionToken, scope)).toBeNull();
 expect(pool.execute).not.toHaveBeenCalled();
});
it.each(['revoked', 'declined', 'expired'])('does not reactivate a %s invitation', async status => {
 invite.status = status;
 await expect(resolveCoGuardianResumeBinding(submission, sessionToken, scope)).rejects.toHaveProperty('status', 410);
});
it('checks expiry of both the invitation and saved session', async () => {
 invite.expires_at = new Date(0);
 await expect(resolveCoGuardianResumeBinding(submission, sessionToken, scope)).rejects.toHaveProperty('status', 410);
 invite.expires_at = new Date(Date.now()+86400000); submission.draft_expires_at = new Date(0);
 await expect(resolveCoGuardianResumeBinding(submission, sessionToken, scope)).rejects.toHaveProperty('status', 410);
});
it.each([{ agencyId: 3 }, { publicKey: 'other-school' }])('rejects the wrong agency or enrollment form: %j', async wrongScope => {
 await expect(resolveCoGuardianResumeBinding(submission, sessionToken, { ...scope, ...wrongScope })).rejects.toHaveProperty('status', 403);
});
it('rejects a different accepted guardian', async () => {
 invite.accepted_user_id = 99; submission.guardian_user_id = 98;
 await expect(resolveCoGuardianResumeBinding(submission, sessionToken, scope)).rejects.toHaveProperty('status', 403);
});
it('revalidates the saved session at account activation and still requires completed agreements', async () => {
 await expect(acceptCoGuardianInvite({ resume: { ...scope, submissionId: submission.id, sessionToken } })).rejects.toHaveProperty('status', 409);
 expect(IntakeSubmission.findBySessionToken).toHaveBeenCalledWith(sessionToken);
 expect(pool.execute.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
});
it('cannot activate a different submission using another valid resume token', async () => {
 await expect(acceptCoGuardianInvite({ resume: { ...scope, submissionId: 122, sessionToken } })).rejects.toHaveProperty('status', 403);
 expect(pool.execute).not.toHaveBeenCalled();
});
