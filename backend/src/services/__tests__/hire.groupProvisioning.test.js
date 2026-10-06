import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), setWork: vi.fn(), findEmail: vi.fn(), available: vi.fn(), create: vi.fn(), group: vi.fn(), member: vi.fn(), settings: vi.fn(), delivery: vi.fn(), inbox: vi.fn(), sender: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../models/User.model.js', () => ({ default: { findByEmail: m.findEmail, setWorkEmail: m.setWork } }));
vi.mock('../googleWorkspaceDirectory.service.js', () => ({ default: { isConfigured: () => true, isDirectoryEmailAvailable: m.available, createGroup: m.create, getGroup: m.group, addGroupMember: m.member, applyGroupAccessSettings: m.settings, setGroupMemberDeliverySettings: m.delivery } }));
vi.mock('../personalMailbox.service.js', () => ({ ensurePersonalMailboxForAddress: m.inbox }));
vi.mock('../hireGroupEmail.service.js', () => ({ ensureHireGroupSender: m.sender }));
import { checkHireWorkEmailAvailability, provisionHireGroupUsername } from '../hireGroupAccount.service.js';
const user = { id: 9, email: 'personal@example.test', personal_email: 'personal@example.test', first_name: 'New', last_name: 'Hire' };
const agency = { id: 2, feature_flags: { hireAccountMode: 'group_password', workspaceEmailDomain: 'tenant.test' } };
const email = 'newh@tenant.test';
beforeEach(() => { vi.resetAllMocks(); m.execute.mockResolvedValue([[]]); m.available.mockResolvedValue(true); m.create.mockResolvedValue({ id: 'group-1' }); m.group.mockResolvedValue({ id: 'group-1' }); m.inbox.mockResolvedValue({ id: 25 }); m.sender.mockResolvedValue({ emailSendingReady: true, senderVerification: 'accepted' }); });
it('creates the group, app inbox and verified sender before reporting success', async () => {
 const result = await provisionHireGroupUsername({ user, agency, workEmail: email });
 expect(result).toMatchObject({ workEmail: email, personalInboxId: 25, emailSendingReady: true });
 expect(m.sender).toHaveBeenCalledWith({ email, displayName: 'New Hire' });
 expect(m.sender.mock.invocationCallOrder[0]).toBeGreaterThan(m.inbox.mock.invocationCallOrder[0]);
});
it('resumes Gmail setup after an outage without creating another group or resetting a prepared password', async () => {
 m.sender.mockRejectedValueOnce(Object.assign(new Error('Gmail unavailable'), { code: 'HIRE_GROUP_SENDER_NOT_READY' }));
 await expect(provisionHireGroupUsername({ user, agency, workEmail: email })).rejects.toHaveProperty('code', 'HIRE_GROUP_SENDER_NOT_READY');
 expect(m.setWork).toHaveBeenCalledWith(user.id, email); m.execute.mockClear();
 const result = await provisionHireGroupUsername({ user: { ...user, work_email: email, login_is_group_email: 1, sso_password_override: 1 }, agency, workEmail: email });
 expect(result).toMatchObject({ emailSendingReady: true, passwordSet: true, ssoPasswordOverride: true }); expect(m.create).toHaveBeenCalledOnce(); expect(m.setWork).toHaveBeenCalledOnce(); expect(m.execute).not.toHaveBeenCalled();
});
it('does not report successful setup if the app inbox fails', async () => {
 m.inbox.mockRejectedValue(new Error('storage unavailable')); await expect(provisionHireGroupUsername({ user, agency, workEmail: email })).rejects.toThrow('storage unavailable'); expect(m.sender).not.toHaveBeenCalled();
});
it('does not allow retry to replace an existing username or reuse a non-group account', async () => {
 for (const candidate of [{ ...user, work_email: 'other@tenant.test', login_is_group_email: 1 }, { ...user, work_email: email, login_is_group_email: 0 }]) {
  await expect(provisionHireGroupUsername({ user: candidate, agency, workEmail: email })).rejects.toHaveProperty('code', 'USERNAME_ALREADY_SET');
 }
 expect(m.create).not.toHaveBeenCalled(); expect(m.sender).not.toHaveBeenCalled();
});

it('allows a custom agency username after checking current availability', async () => {
 const result = await checkHireWorkEmailAvailability({ email: 'Custom.Address@tenant.test', userId: user.id, agency });
 expect(result).toMatchObject({ available: true, email: 'custom.address@tenant.test' });
 expect(m.available).toHaveBeenCalledWith('custom.address@tenant.test');
});
it.each(['two@@tenant.test', 'has space@tenant.test', 'name..last@tenant.test', '.name@tenant.test', 'name.@tenant.test'])('rejects malformed custom email %s before checking the directory', async invalid => {
 expect(await checkHireWorkEmailAvailability({ email: invalid, userId: user.id, agency })).toMatchObject({ available: false, reason: 'invalid_email' });
 expect(m.available).not.toHaveBeenCalled();
});
it('rejects a custom address outside the agency domain', async () => {
 expect(await checkHireWorkEmailAvailability({ email: 'custom@other.test', userId: user.id, agency })).toMatchObject({ available: false, reason: 'wrong_domain', expectedDomain: 'tenant.test' });
 expect(m.available).not.toHaveBeenCalled();
});
it('does not provision a custom address belonging to someone else', async () => {
 m.findEmail.mockResolvedValue({ id: 25 });
 await expect(provisionHireGroupUsername({ user, agency, workEmail: 'custom@tenant.test' })).rejects.toHaveProperty('code', 'EMAIL_UNAVAILABLE');
 expect(m.create).not.toHaveBeenCalled();
});
