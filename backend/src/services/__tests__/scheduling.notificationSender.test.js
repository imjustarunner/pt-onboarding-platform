import { expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ mailboxes: vi.fn(), trigger: vi.fn(), identity: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../providerWaitlistEmail.service.js', () => ({ resolveWaitlistMailboxes: m.mailboxes }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendNotificationEmail: m.trigger, sendEmailFromIdentity: m.identity }));
import { sendScheduleNotificationEmail } from '../scheduleNotificationEmail.service.js';
it('always selects the tenant notifications From and support Reply-To', async () => {
  m.mailboxes.mockResolvedValue({ senderIdentityId: 7, from: 'notifications@itsco.health', support: 'support@itsco.health' });
  await sendScheduleNotificationEmail({ agencyId: 2, senderIdentityId: 99, replyToOverride: 'other@example.test', subject: 'Cancellation' });
  expect(m.trigger).toHaveBeenCalledWith(expect.objectContaining({ agencyId: 2, senderIdentityId: 7, replyToOverride: 'support@itsco.health' }));
  await sendScheduleNotificationEmail({ agencyId: 2, existingCommunicationId: 88 });
  expect(m.identity).toHaveBeenCalledWith(expect.objectContaining({ senderIdentityId: 7, replyToOverride: 'support@itsco.health', existingCommunicationId: 88 }));
});
it('does not fall back to an unrelated sender when tenant mailboxes are missing', async () => {
  vi.clearAllMocks(); m.mailboxes.mockRejectedValue(new Error('Configure tenant mailboxes'));
  await expect(sendScheduleNotificationEmail({ agencyId: 2 })).rejects.toThrow('Configure tenant');
  expect(m.trigger).not.toHaveBeenCalled(); expect(m.identity).not.toHaveBeenCalled();
});
