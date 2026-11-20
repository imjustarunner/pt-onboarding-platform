import { beforeEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  context: vi.fn(), portalSend: vi.fn(), send: vi.fn(), mailboxes: vi.fn()
}));
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../clientPortalEmail.service.js', () => ({
  clientEmailContext: mock.context, sendClientPortalEmail: mock.portalSend
}));
vi.mock('../providerWaitlistEmail.service.js', () => ({ resolveWaitlistMailboxes: mock.mailboxes }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({
  sendEmailFromIdentity: mock.send, sendNotificationEmail: vi.fn()
}));
vi.mock('../portalEmailBranding.service.js', () => ({ renderPortalEmail: vi.fn(() => '<p>Notification</p>') }));
vi.mock('../clientServiceNotificationPolicy.service.js', () => ({ serviceNotificationBlocked: vi.fn(async () => false) }));
vi.mock('../dayCancellationEmail.service.js', () => ({ resolveDayCancellationEmail: vi.fn(), reviewedDayCancellationContext: vi.fn() }));
vi.mock('../appointmentCancellationEmail.service.js', () => ({ individualCancellationEmailContext: vi.fn() }));

import { sendScheduleNotificationEmail } from '../scheduleNotificationEmail.service.js';

const qa = { id: 453, slug: 'nlu-qa-demo', name: 'QA agency', is_active: 1,
  feature_flags: { qaSandbox: { program: 'tutoring', sourceAgencyId: 6, syntheticOnly: true } } };
const notice = { agencyId: 453, clientId: 2547, to: 'qa@example.com', existingCommunicationId: 103,
  entries: [{ appointment: { businessType: 'tutoring' }, payload: { eventType: 'no_show',
    facts: { noShowReviewFinalized: true, reasonCategory: 'attendance_no_show' } } }] };
beforeEach(() => {
  vi.resetAllMocks();
  mock.context.mockResolvedValue({ tenant: qa, brand: {} });
  mock.mailboxes.mockRejectedValue(Object.assign(new Error('Sender missing'), { code: 'WAITLIST_MAILBOX_NOT_CONFIGURED' }));
});

it('uses the verified redirected QA portal sender for finalized tutoring no-shows when support mailboxes are unavailable', async () => {
  await sendScheduleNotificationEmail(notice);
  expect(mock.portalSend).toHaveBeenCalledWith(expect.objectContaining({ agencyId: 453, to: 'qa@example.com', existingCommunicationId: 103 }));
  expect(mock.send).not.toHaveBeenCalled();
});

it('uses the configured notifications identity and Support Reply-To when available', async () => {
  mock.mailboxes.mockResolvedValue({ senderIdentityId: 123, support: 'support@nextleveluplcc.com' });
  await sendScheduleNotificationEmail(notice);
  expect(mock.send).toHaveBeenCalledWith(expect.objectContaining({ senderIdentityId: 123, replyToOverride: 'support@nextleveluplcc.com' }));
  expect(mock.portalSend).not.toHaveBeenCalled();
});

it('keeps the strict mailbox requirement for the live tenant', async () => {
  mock.context.mockResolvedValue({ tenant: { ...qa, id: 6, slug: 'nlu' }, brand: {} });
  await expect(sendScheduleNotificationEmail({ ...notice, agencyId: 6 })).rejects.toMatchObject({ code: 'SCHEDULE_MAILBOX_NOT_CONFIGURED' });
  expect(mock.portalSend).not.toHaveBeenCalled();
});
