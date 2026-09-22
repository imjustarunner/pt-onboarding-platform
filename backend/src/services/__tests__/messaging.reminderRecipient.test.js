import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../googleWorkspaceDirectory.service.js', () => ({ default: { isConfigured: vi.fn(() => true), getUser: vi.fn(async () => null), getGroup: vi.fn(async () => ({ id: 'group' })) } }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: vi.fn() } }));
import User from '../../models/User.model.js';
import Directory from '../googleWorkspaceDirectory.service.js';
import { messageReminderRecipient, assertMessageReminderRecipient } from '../messageReminderRecipient.service.js';
const user = { email: 'provider@itsco.health', work_email: 'provider@itsco.health', personal_email: 'private@example.org', role: 'provider', sso_password_override: 0, login_is_group_email: 0 };
beforeEach(() => { vi.clearAllMocks(); Directory.isConfigured.mockReturnValue(true); Directory.getUser.mockResolvedValue(null); Directory.getGroup.mockResolvedValue({ id: 'group' }); });
it('never sends an email reminder to an SSO user, regardless of saved personal address', async () => {
  expect(await messageReminderRecipient(user)).toBeNull();
  expect(Directory.getUser).not.toHaveBeenCalled();
});
it('routes secure and future SMS reminders to the SSO address, never personal email', async () => {
  for (const channel of ['secure', 'sms']) expect(await messageReminderRecipient(user, { channel })).toBe(user.email);
});
it('requires both explicit app-only flags and a verified Group login for personal fallback', async () => {
  expect(await messageReminderRecipient({ ...user, sso_password_override: 1 })).toBeNull();
  expect(await messageReminderRecipient({ ...user, sso_password_override: 1, login_is_group_email: 1 })).toBe(user.personal_email);
});
it('rejects stale app-only flags when the login is now a real Workspace user', async () => {
  Directory.getUser.mockResolvedValue({ id: 'workspace-user' });
  expect(await messageReminderRecipient({ ...user, sso_password_override: 1, login_is_group_email: 1 })).toBeNull();
});
it('fails closed for an unavailable or missing Group, opted-out users, demos, and nonproviders', async () => {
  const appOnly = { ...user, sso_password_override: 1, login_is_group_email: 1 };
  expect(await messageReminderRecipient(appOnly, { allowPersonal: false })).toBeNull();
  expect(await messageReminderRecipient({ ...appOnly, is_demo: 1 })).toBeNull();
  expect(await messageReminderRecipient({ ...appOnly, role: 'admin' })).toBeNull();
  Directory.getGroup.mockResolvedValue(null); expect(await messageReminderRecipient(appOnly)).toBeNull();
  Directory.isConfigured.mockReturnValue(false); expect(await messageReminderRecipient(appOnly)).toBeNull();
});
it('does not fall back to personal email when an SSO work address is missing', async () => {
  expect(await messageReminderRecipient({ ...user, email: user.personal_email, work_email: '' }, { channel: 'secure' })).toBeNull();
});
it('blocks a previously queued personal reminder after the provider becomes SSO', async () => {
  User.findById.mockResolvedValue(user);
  await expect(assertMessageReminderRecipient({ templateType: 'personal_thread_reminder', userId: 5, to: user.personal_email })).rejects.toMatchObject({ code: 'REMINDER_RECIPIENT_POLICY' });
  await expect(assertMessageReminderRecipient({ templateType: 'hub_secure_unread_digest', userId: 5, to: user.personal_email })).rejects.toMatchObject({ code: 'REMINDER_RECIPIENT_POLICY' });
  await expect(assertMessageReminderRecipient({ templateType: 'hub_secure_unread_digest', userId: 5, to: user.email })).resolves.toBeUndefined();
});
it('never allows copies of a reminder to additional addresses', async () => {
  User.findById.mockResolvedValue(user);
  await expect(assertMessageReminderRecipient({ templateType: 'hub_secure_unread_digest', userId: 5, to: user.email, bcc: ['private@example.org'] })).rejects.toMatchObject({ status: 400 });
});

it('routes a migrated Workspace user to SSO even when personal reminders are opted out', async () => {
  Directory.getUser.mockResolvedValue({ id: 'workspace-user' });
  const migrated = { ...user, sso_password_override: 1, login_is_group_email: 1 };
  expect(await messageReminderRecipient(migrated, { channel: 'secure', allowPersonal: false })).toBe(user.email);
});

it('verifies the Group after the Directory userKey error, never bypassing Group checks', async () => {
 const appOnly={...user,sso_password_override:1,login_is_group_email:1};
 Directory.getUser.mockRejectedValue(Object.assign(new Error('Type not supported: userKey'),{code:400}));
 expect(await messageReminderRecipient(appOnly)).toBe(user.personal_email);
 Directory.getGroup.mockResolvedValue(null);
 expect(await messageReminderRecipient(appOnly)).toBeNull();
 Directory.getUser.mockRejectedValue(Object.assign(new Error('Permission denied'),{code:403}));
 await expect(messageReminderRecipient(appOnly)).rejects.toThrow('Permission denied');
});
