import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn(async () => ({ id: 2, slug: 'itsco', name: 'ITSCO' })) } }));
vi.mock('../emailSendMailbox.service.js', () => ({ resolveEmailSendMailbox: vi.fn(async () => ({ identity: { id: 4 }, displayName: 'Staff' })) }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: vi.fn(async () => ({ id: 'gmail-id' })) }));
vi.mock('../hubBrandedEmail.service.js', () => ({ buildBrandedMessageEmailHtml: vi.fn(() => '<p>Branded</p>') }));
vi.mock('../availabilityWindow.service.js', () => ({ resolveAvailabilitySchedule: vi.fn(), addBusinessHours: vi.fn() }));
vi.mock('../emailSettings.service.js', () => ({ getAgencyEmailSettings: vi.fn(async () => ({})) }));
vi.mock('../unifiedInbox.service.js', () => ({ isAddressBlocked: vi.fn(async () => false) }));
import pool from '../../config/database.js';
import { sendEmailFromIdentity } from '../unifiedEmail/unifiedEmailSender.service.js';
import { getAgencyEmailSettings } from '../emailSettings.service.js';
import { runPersonalThreadReminders, queuePersonalReminderReply } from '../personalThreadReminder.service.js';
import { personalReminderReplyText, personalReminderBody } from '../../utils/personalReminderReply.js';
const inbox = { id: 3, agency_id: 2, owner_user_id: 5, from_email: 'staff@itsco.health' };
const reminder = { id: 1, user_id: 5, user_status: 'active', personal_email: 'private@example.org', conversation_id: 10, from_json: { email: 'client@example.org' }, parent_id: '<external@example.org>', parent_references: '<root@example.org>', subject: 'Meeting' };
const reply = { inbox, fromEmail: 'private@example.org', deliveryId: '<reply@example.org>', bodyText: 'Confirmed.\n\nOn Monday Staff wrote:\n> Notification', inReplyTo: '<reminder@itsco.health>' };
beforeEach(() => vi.clearAllMocks());
it('removes quoted private headers and replaces a private address in the new reply', () => {
  expect(personalReminderReplyText('Contact private@example.org\n\nOn Monday,\nStaff wrote:\n> To: private@example.org', 'private@example.org', inbox.from_email)).toBe('Contact staff@itsco.health');
});
it('does not turn an unrelated personal email into an outbound staff reply', async () => {
  pool.execute.mockResolvedValue([[]]);
  expect(await queuePersonalReminderReply(reply)).toBeNull();
  expect(pool.getConnection).not.toHaveBeenCalled();
});
it('rejects a different sender who quotes the reminder reference', async () => {
  pool.execute.mockResolvedValue([[reminder]]);
  await expect(queuePersonalReminderReply({ ...reply, fromEmail: 'other@example.org' })).rejects.toThrow('mailbox owner');
  expect(pool.getConnection).not.toHaveBeenCalled();
});
it('queues the reply and receipt together using the original external RFC parent and work identity', async () => {
  pool.execute.mockResolvedValue([[reminder]]);
  const db = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async (sql) => sql.startsWith('INSERT INTO communication_messages') ? [{ insertId: 80 }] : [[]]) };
  pool.getConnection.mockResolvedValue(db);
  const result = await queuePersonalReminderReply(reply);
  expect(result).toMatchObject({ conversationId: 10, messageId: 80, queuedPersonalReply: true });
  const insert = db.execute.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO communication_messages'));
  expect(insert[1]).toEqual([10, 5, JSON.stringify({ email: inbox.from_email }), JSON.stringify([{ email: 'client@example.org' }]), '[]', '[]', 'Re: Meeting', 'Confirmed.', '<external@example.org>', '<root@example.org> <external@example.org>']);
  expect(db.commit).toHaveBeenCalledOnce();
  expect(sendEmailFromIdentity).not.toHaveBeenCalled();
});
it('deduplicates a re-delivered personal reply before creating an outbound message', async () => {
  pool.execute.mockResolvedValue([[reminder]]);
  const db = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async (sql) => sql.includes('SELECT message_id') ? [[{ message_id: 80 }]] : [[]]) };
  pool.getConnection.mockResolvedValue(db);
  expect(await queuePersonalReminderReply(reply)).toMatchObject({ duplicate: true, messageId: 80 });
  expect(db.execute.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
});
it('sends a claimed per-thread reminder after 24 elapsed hours with an exact normal-login destination', async () => {
  const row = { conversation_id: 10, message_id: 20, agency_id: 2, inbox_id: 3, user_id: 5, sender_identity_id: 4, from_email: inbox.from_email, personal_email: reminder.personal_email, subject: 'Meeting', received_at: '2026-09-01T00:00:00Z', availability_hours_enabled: 0 };
  pool.execute.mockImplementation(async (sql) => sql.startsWith('SELECT c.id') ? [[row]] : [{ affectedRows: 1 }]);
  expect(await runPersonalThreadReminders({ now: new Date('2026-09-02T00:00:00Z') })).toMatchObject({ sent: 1 });
  expect(sendEmailFromIdentity).toHaveBeenCalledWith(expect.objectContaining({ to: reminder.personal_email, replyToOverride: inbox.from_email, text: expect.stringContaining('messages?conversationId=10'), internetMessageIdOverride: expect.stringMatching(/^<.+@itsco.health>$/) }));
});
it('does not send early or send again when another worker owns the reminder claim', async () => {
  const row = { conversation_id: 10, message_id: 20, agency_id: 2, inbox_id: 3, user_id: 5, from_email: inbox.from_email, received_at: '2026-09-01T00:00:00Z', availability_hours_enabled: 0 };
  pool.execute.mockImplementation(async (sql) => sql.startsWith('SELECT c.id') ? [[row]] : [{ affectedRows: 0 }]);
  await runPersonalThreadReminders({ now: new Date('2026-09-01T23:59:59Z') });
  await runPersonalThreadReminders({ now: new Date('2026-09-02T00:00:00Z') });
  expect(sendEmailFromIdentity).not.toHaveBeenCalled();
});

it('extracts only the new HTML reply and excludes quoted notification and text attachments', async () => {
  const html = '<p>Confirmed &amp; thank you.</p><div class="gmail_quote"><p>Private notification</p></div>';
  const payload = { parts: [{ mimeType: 'text/html', body: { data: Buffer.from(html).toString('base64url') } }, { mimeType: 'text/plain', filename: 'notes.txt', body: { data: Buffer.from('Attachment content').toString('base64url') } }] };
  expect(await personalReminderBody(payload)).toBe('Confirmed & thank you.');
});

it('preserves a saved personal delay instead of overriding it with the tenant default', async () => {
  getAgencyEmailSettings.mockResolvedValue({ personalEmailDigestBusinessHours: 24 });
  pool.execute.mockResolvedValue([[{ conversation_id: 10, message_id: 20, agency_id: 2, inbox_id: 3, user_id: 5, from_email: inbox.from_email, received_at: '2026-09-01T00:00:00Z', availability_hours_enabled: 0, digest_hours: 48 }]]);
  await runPersonalThreadReminders({ now: new Date('2026-09-02T00:00:00Z') });
  expect(sendEmailFromIdentity).not.toHaveBeenCalled();
});
