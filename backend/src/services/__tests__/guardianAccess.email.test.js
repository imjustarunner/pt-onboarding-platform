import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../tenantMessageMailboxes.service.js', () => ({ ensureTenantNotificationsMailbox: vi.fn() }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: vi.fn() }));
import { ensureTenantNotificationsMailbox } from '../tenantMessageMailboxes.service.js';
import { sendEmailFromIdentity } from '../unifiedEmail/unifiedEmailSender.service.js';
import { sendGuardianNotificationEmail } from '../guardianNotificationEmail.service.js';
beforeEach(() => { vi.clearAllMocks(); ensureTenantNotificationsMailbox.mockResolvedValue({ domain: 'tenant.test', notifications: { id: 9, agency_id: 2, is_active: 1, from_email: 'Notifications@tenant.test' } }); });
describe('guardian invitation delivery', () => {
  it('uses the tenant notifications identity and support replies', async () => {
    sendEmailFromIdentity.mockResolvedValue({ id: 'accepted', communicationId: 44 });
    const result = await sendGuardianNotificationEmail({ agencyId: 2, to: 'guardian@example.test', subject: 'Invitation', replyToOverride: 'wrong@example.test', senderIdentityId: 99 });
    expect(sendEmailFromIdentity).toHaveBeenCalledWith(expect.objectContaining({ senderIdentityId: 9, replyToOverride: 'support@tenant.test', usedFallbackSender: false }));
    expect(result).toMatchObject({ sent: true, deliveryStatus: 'sent', communicationId: 44 });
  });
  it.each([{ queued: true }, { id: 'held', blocked: true }, { skipped: true }, { redirected: true, id: 'demo' }, {}])('does not report %j as delivered', async result => {
    sendEmailFromIdentity.mockResolvedValue(result);
    expect((await sendGuardianNotificationEmail({ agencyId: 2 })).sent).toBe(false);
  });
  it.each([{ agency_id: 3 }, { is_active: 0 }, { from_email: 'fallback@tenant.test' }])('refuses an invalid sender %j', async bad => {
    ensureTenantNotificationsMailbox.mockResolvedValue({ domain: 'tenant.test', notifications: { id: 9, agency_id: 2, is_active: 1, from_email: 'notifications@tenant.test', ...bad } });
    await expect(sendGuardianNotificationEmail({ agencyId: 2 })).rejects.toThrow('notifications sender');
    expect(sendEmailFromIdentity).not.toHaveBeenCalled();
  });
});
