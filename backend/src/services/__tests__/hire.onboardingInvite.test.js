import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ send: vi.fn(), receipt: vi.fn(), agency: vi.fn(), identity: vi.fn() }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendNotificationEmail: m.send, sendEmailFromIdentity: m.receipt }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: m.agency } }));
vi.mock('../../models/EmailSenderIdentity.model.js', () => ({ default: { findByAgencyAndIdentityKey: m.identity } }));
import { sendOnboardingPortalInviteEmail } from '../onboardingInviteEmail.service.js';

const args = { agencyId: 2, user: { id: 42, first_name: 'Sam', email: 'work@agency.test', personal_email: 'sam@example.com' },
  portalLink: 'https://app.itsco.health/pre-hire/controlled-test-token', generatedByUserId: 501 };
beforeEach(() => {
  vi.clearAllMocks();
  m.agency.mockResolvedValue({ slug: 'nlu' });
  m.identity.mockResolvedValue({ id: 18, agency_id: 2, from_email: 'PO@nextleveluplcc.com' });
  m.send.mockResolvedValue({ id: 'provider-receipt', communicationId: 99 });
  m.receipt.mockResolvedValue({ id: 'staff-receipt' });
});

it('uses the selected agency People Operations rule and logs the candidate and initiating actor', async () => {
  expect(await sendOnboardingPortalInviteEmail(args)).toMatchObject({ status: 'sent', communicationId: 99 });
  expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ agencyId: 2, triggerKey: 'pre_hire_admin_review_access',
    templateType: 'onboarding_portal_invite', to: 'sam@example.com', userId: 42, generatedByUserId: 501, source: 'manual',
    senderIdentityId: 18, replyToOverride: 'po@nextleveluplcc.com' }));
  expect(m.send.mock.calls[0][0].text).toContain(args.portalLink);
  expect(m.send.mock.calls[0][0].text).toContain('14 days');
  expect(m.send.mock.calls[0][0]).not.toHaveProperty('bcc');
  expect(m.receipt).toHaveBeenCalledWith(expect.objectContaining({
    to: 'po@nextleveluplcc.com', bcc: 'founders@nextleveluplcc.com', templateType: 'onboarding_invitation_receipt'
  }));
  expect(JSON.stringify(m.receipt.mock.calls[0][0])).not.toContain(args.portalLink);
});

it('preserves promotion wording and the same portal link', async () => {
  await sendOnboardingPortalInviteEmail({ ...args, promoted: true });
  expect(m.send.mock.calls[0][0]).toMatchObject({ subject: 'Your onboarding portal is ready', text: expect.stringContaining('same personal link') });
});

it.each([
  [{ blocked: true, reason: 'missing_sender_alias_blocked' }, 'failed'],
  [{ skipped: true, reason: 'notifications_disabled' }, 'failed'],
  [{ queued: true, pendingApproval: true }, 'pending'],
  [{ id: 'stale-receipt', blocked: true }, 'failed'],
  [{ ok: true }, 'failed'],
  [undefined, 'failed']
])('reports the actual delivery outcome without retrying around a hold: %j', async (result, status) => {
  m.send.mockResolvedValue(result);
  expect(await sendOnboardingPortalInviteEmail(args)).toMatchObject({ status });
  expect(m.send).toHaveBeenCalledTimes(1);
  expect(m.receipt).not.toHaveBeenCalled();
});

it('refuses an invitation without an organization or candidate and does not infer either from the recipient', async () => {
  await expect(sendOnboardingPortalInviteEmail({ ...args, agencyId: null })).rejects.toThrow('organization and candidate');
  await expect(sendOnboardingPortalInviteEmail({ ...args, user: { email: 'sam@example.com' } })).rejects.toThrow('organization and candidate');
  expect(m.send).not.toHaveBeenCalled();
});

it('does not claim delivery for an account with no recipient', async () => {
  expect(await sendOnboardingPortalInviteEmail({ ...args, user: { id: 42 } })).toMatchObject({ status: 'failed', reason: 'no_recipient_email' });
  expect(m.send).not.toHaveBeenCalled();
});

it('surfaces transport failures for the caller to report', async () => {
  m.send.mockRejectedValue(new Error('Transport unavailable'));
  await expect(sendOnboardingPortalInviteEmail(args)).rejects.toThrow('Transport unavailable');
  expect(m.send).toHaveBeenCalledTimes(1);
});

it.each([
  ['tisi', 'innerstrengthin.com'],
  ['plottwistco', 'plottwistco.com']
])('blind-copies the %s Founders group using its mail domain', async (slug, domain) => {
  m.agency.mockResolvedValue({ slug });
  m.identity.mockResolvedValue({ id: 18, agency_id: 2, from_email: `po@${domain}` });
  await sendOnboardingPortalInviteEmail(args);
  expect(m.receipt).toHaveBeenCalledWith(expect.objectContaining({ bcc: `founders@${domain}` }));
});

it('refuses a People Operations sender on a different company domain', async () => {
  m.identity.mockResolvedValue({ id: 18, agency_id: 2, from_email: 'po@itsco.health' });
  expect(await sendOnboardingPortalInviteEmail(args)).toMatchObject({ status: 'failed', reason: 'no_people_operations_sender' });
  expect(m.send).not.toHaveBeenCalled();
  expect(m.receipt).not.toHaveBeenCalled();
});

it.each(['po@nextleveluplcc.com', 'founders@nextleveluplcc.com', 'sam@example.com, additional@example.com'])(
  'keeps the candidate token out of a staff or multi-recipient envelope', async personal_email => {
    const result = await sendOnboardingPortalInviteEmail({ ...args, user: { ...args.user, personal_email } });
    expect(result).toMatchObject({ status: 'failed', reason: 'invalid_candidate_email' });
    expect(m.send).not.toHaveBeenCalled();
    expect(m.receipt).not.toHaveBeenCalled();
  }
);
