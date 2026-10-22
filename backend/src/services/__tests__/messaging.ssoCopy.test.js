import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: () => {} }));
vi.mock('../emailSendMailbox.service.js', () => ({ resolveEmailSendMailbox: vi.fn() }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: vi.fn() } }));
import User from '../../models/User.model.js';
import { resolveEmailSendMailbox } from '../emailSendMailbox.service.js';
import { withSsoSenderCopy } from '../ssoEmailCopy.service.js';
import { buildMimeMessage } from '../unifiedEmail/mime.js';
const input = { identity: { agency_id: 2, identity_key: 'messages', from_email: 'messages@itsco.health' }, generatedByUserId: 567, source: 'manual', to: 'parent@example.test', cc: null, bcc: null };
beforeEach(() => {
  vi.resetAllMocks();
  User.findById.mockResolvedValue({ id: 567, role: 'provider', status: 'ACTIVE', sso_password_override: 0, login_is_group_email: 0 });
  resolveEmailSendMailbox.mockResolvedValue({ routing: 'workspace_user', fromEmail: input.identity.from_email, inbox: { from_email: 'halle@itsco.health' } });
});
it('copies the verified SSO mailbox as BCC and keeps the parent as the only To recipient', async () => {
  const bcc = await withSsoSenderCopy(input);
  expect(bcc).toBe('halle@itsco.health');
  expect(resolveEmailSendMailbox).toHaveBeenCalledWith({ agencyId: 2, userId: 567 });
  const mime = buildMimeMessage({ to: input.to, bcc, from: input.identity.from_email, replyTo: input.identity.from_email, subject: 'Update', text: 'Hello' });
  expect(mime).toContain('To: parent@example.test\r\n');
  expect(mime).toContain('Bcc: halle@itsco.health\r\n');
  expect(mime).toContain('Reply-To: messages@itsco.health\r\n');
});
it.each(['to', 'cc', 'bcc'])('does not duplicate a sender already in %s', async field => {
  const payload = { ...input, [field]: 'Halle <HALLE@itsco.health>' };
  expect(await withSsoSenderCopy(payload)).toBe(payload.bcc);
});
it('preserves other BCC recipients', async () => {
  expect(await withSsoSenderCopy({ ...input, bcc: 'reviewer@example.test' })).toBe('reviewer@example.test, halle@itsco.health');
});
it('never adds a copy for a Group account', async () => {
  resolveEmailSendMailbox.mockResolvedValue({ routing: 'app_group_alias', fromEmail: 'halle@itsco.health' });
  expect(await withSsoSenderCopy(input)).toBeNull();
});
it.each([{ sso_password_override: 1 }, { login_is_group_email: 1 }, { is_archived: 1 }])('never copies a non-SSO or inactive account: %j', async patch => {
  User.findById.mockResolvedValue({ id: 567, role: 'provider', status: 'ACTIVE', ...patch });
  expect(await withSsoSenderCopy(input)).toBeNull();
  expect(resolveEmailSendMailbox).not.toHaveBeenCalled();
});
it.each([{ source: 'auto' }, { generatedByUserId: null }, { identity: { ...input.identity, identity_key: 'notifications' } }])('leaves non-staff Messages sends unchanged: %j', async patch => {
  expect(await withSsoSenderCopy({ ...input, ...patch })).toBeNull();
  expect(resolveEmailSendMailbox).not.toHaveBeenCalled();
});
it('does not guess a copy address if account verification fails', async () => {
  resolveEmailSendMailbox.mockRejectedValue(new Error('Directory unavailable'));
  await expect(withSsoSenderCopy(input)).rejects.toThrow('Directory unavailable');
});
