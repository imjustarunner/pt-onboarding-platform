import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ group: vi.fn(), alias: vi.fn() }));
vi.mock('../googleWorkspaceDirectory.service.js', () => ({ default: { isConfigured: () => true, getGroup: m.group } }));
vi.mock('../gmailSendAs.service.js', () => ({ ensureSendAsAlias: m.alias }));
import { ensureHireGroupSender, ensureHireGroupEmailForActivation } from '../hireGroupEmail.service.js';
const user = { work_email: 'staff@tenant.test', login_is_group_email: 1, first_name: 'New', last_name: 'Employee' };
beforeEach(() => { vi.resetAllMocks(); m.group.mockResolvedValue({ id: 'existing-group' }); m.alias.mockResolvedValue({ ok: true, sendAs: { sendAsEmail: user.work_email, verificationStatus: 'accepted' } }); });
it('registers the existing group as a sender and keeps replies with that employee', async () => {
 expect(await ensureHireGroupEmailForActivation(user)).toEqual({ emailSendingReady: true, senderVerification: 'accepted' });
 expect(m.alias).toHaveBeenCalledWith({ sendAsEmail: user.work_email, displayName: 'New Employee', replyToAddress: user.work_email });
});
it('does not provision an arbitrary address without a Workspace group', async () => {
 m.group.mockResolvedValue(null); await expect(ensureHireGroupEmailForActivation(user)).rejects.toHaveProperty('code', 'HIRE_GROUP_EMAIL_REQUIRED'); expect(m.alias).not.toHaveBeenCalled();
});
it.each([
 { ok: false, retryAt: 1234 },
 { ok: true, sendAs: { sendAsEmail: user.work_email, verificationStatus: 'pending' } },
 { ok: true, sendAs: { sendAsEmail: 'wrong@tenant.test', verificationStatus: 'accepted' } }
])('does not report sending ready on an incomplete Gmail result', async result => {
 m.alias.mockResolvedValue(result); await expect(ensureHireGroupEmailForActivation(user)).rejects.toMatchObject({ status: 503, code: 'HIRE_GROUP_SENDER_NOT_READY' });
});
it('propagates an outage and safely succeeds on retry', async () => {
 m.alias.mockRejectedValueOnce(Object.assign(new Error('cooldown'), { code: 'GMAIL_MAILBOX_THROTTLED' }));
 await expect(ensureHireGroupSender({ email: user.work_email })).rejects.toHaveProperty('code', 'GMAIL_MAILBOX_THROTTLED');
 await expect(ensureHireGroupEmailForActivation(user)).resolves.toHaveProperty('emailSendingReady', true);
});
it('leaves ordinary Workspace employee activation unchanged', async () => {
 await expect(ensureHireGroupEmailForActivation({ ...user, login_is_group_email: 0 })).resolves.toEqual({ skipped: true }); expect(m.alias).not.toHaveBeenCalled();
});
