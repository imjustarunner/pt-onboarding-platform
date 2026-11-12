import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
import { createPayrollReportInbox } from '../payrollReportInbox.service.js';

function fixture() {
  const csv = 'Employee,Pay\nExample Employee,504.00';
  const report = { id: 1, agency_id: 2, payroll_period_id: 148, communication_id: 7, requested_by_user_id: 55,
    status: 'sent', payroll_status: 'posted', template_type: 'payroll_posted_reconciliation',
    external_message_id: 'gmail-verified', communication_sent_at: '2026-11-12 05:26:37',
    communication_agency_id: 2, sender_identity_id: 9, active_sender_identity_id: 9,
    inbox_id: 9, from_email: 'Payroll@example.test', recipient_email: 'Payroll@example.test', recipient_address: 'Payroll@example.test',
    subject: 'Payroll reconciliation', attachment_filename: 'payroll.csv',
    attachment_sha256: createHash('sha256').update(csv).digest('hex'),
    communication_metadata: { senderIdentityId: 9, fromEmail: 'Payroll@example.test' } };
  const message = { id: 'gmail-verified', threadId: 'thread-verified', labelIds: ['SENT', 'INBOX'], internalDate: '1794461197000',
    payload: { headers: [{ name: 'From', value: 'Payroll <payroll@example.test>' }, { name: 'To', value: 'payroll@example.test' },
      { name: 'Subject', value: report.subject }, { name: 'Message-ID', value: '<verified@example.test>' }],
      parts: [{ mimeType: 'text/plain', body: { data: Buffer.from('The posted report is attached.').toString('base64url') } },
        { partId: '1', filename: 'payroll.csv', mimeType: 'text/csv', body: { attachmentId: 'csv-attachment', size: Buffer.byteLength(csv) } }] } };
  let saved = null;
  const db = { getConnection: async () => ({ execute: async () => [[{ acquired: 1 }]], release() {} }),
    execute: vi.fn(async (sql, args) => {
      expect((sql.match(/\?/g) || []).length).toBe(args.length);
      if (sql.includes('SELECT d.*,c.external_message_id')) return [[report]];
      if (sql.includes('SELECT t.id AS ticket_id')) return [saved ? [saved] : []];
      if (sql.startsWith('SELECT id FROM communication_conversations')) return [[{ id: 80 }]];
      if (sql.includes("ai_draft_status='suppressed'")) {
        expect(sql).toContain('AND ?=(SELECT e.ticket_message_id');
        expect(args).toEqual([70, 2, 75]);
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("'$.payrollReportReceipt',CAST")) {
        saved = { ticket_id: 70, conversation_id: 80, ai_draft_metadata_json: { payrollReportReceipt: JSON.parse(args[0]) } };
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('payrollReportReceipt.notificationsComplete')) { saved.ai_draft_metadata_json.payrollReportReceipt.notificationsComplete = true; return [{ affectedRows: 1 }]; }
      if (sql.includes('SELECT d.id FROM payroll_report_email_deliveries')) return [[{ id: 1 }]];
      throw new Error(`Unexpected SQL: ${sql}`);
    }) };
  const gmail = { users: { messages: { get: vi.fn(async () => ({ data: message })),
    attachments: { get: vi.fn(async () => ({ data: { data: Buffer.from(csv).toString('base64url') } })) } } } };
  const ingest = vi.fn(async () => ({ handled: true, ticketId: 70, ticketMessageId: 75 }));
  const notify = vi.fn(async () => ({ notified: 2 }));
  const syncInbox = vi.fn(async () => ({ synced: 1 }));
  return { report, message, gmail, ingest, notify, syncInbox,
    service: createPayrollReportInbox({ db, getGmail: async () => gmail, ingest, notify, syncInbox }) };
}

it('recovers the already-sent exact CSV as a Payroll ticket and app inbox copy once, with original actor attribution', async () => {
  const f = fixture();
  expect(await f.service.syncDelivery({ deliveryId: 1 })).toEqual({ status: 'ready', ticketId: 70, conversationId: 80 });
  expect(f.ingest).toHaveBeenCalledWith(expect.objectContaining({ agencyId: 2, topic: 'payroll', staffCopy: false,
    createdByUserId: 55, recipients: ['Payroll@example.test'], generateDraft: false, autoPacketIntake: false,
    gmailMessageId: 'gmail-verified', messageId: '<verified@example.test>' }));
  expect(await f.service.syncDelivery({ deliveryId: 1 })).toMatchObject({ status: 'ready', ticketId: 70 });
  expect(f.ingest).toHaveBeenCalledTimes(1);
  expect(f.gmail.users.messages.get).toHaveBeenCalledTimes(1);
  expect(f.notify).toHaveBeenCalledTimes(1);
});

it.each(['wrong sender', 'wrong recipient', 'no sent receipt', 'wrong CSV'])('rejects %s before creating any ticket', async reason => {
  const f = fixture();
  if (reason === 'wrong sender') f.message.payload.headers[0].value = 'other@example.test';
  if (reason === 'wrong recipient') f.message.payload.headers[1].value = 'other@example.test';
  if (reason === 'no sent receipt') f.message.labelIds = ['INBOX'];
  if (reason === 'wrong CSV') f.report.attachment_sha256 = 'wrong-hash';
  await expect(f.service.syncDelivery({ deliveryId: 1 })).rejects.toHaveProperty('code');
  expect(f.ingest).not.toHaveBeenCalled();
  expect(f.notify).not.toHaveBeenCalled();
});

it.each(['tenant', 'route', 'redirect', 'not posted', 'not sent'])('requires verified %s evidence', async reason => {
  const f = fixture();
  if (reason === 'tenant') f.report.communication_agency_id = 3;
  if (reason === 'route') f.report.active_sender_identity_id = 10;
  if (reason === 'redirect') f.report.communication_metadata.testInboxRedirect = true;
  if (reason === 'not posted') f.report.payroll_status = 'ran';
  if (reason === 'not sent') f.report.communication_sent_at = null;
  await expect(f.service.syncDelivery({ deliveryId: 1 })).rejects.toHaveProperty('code', 'PAYROLL_INBOX_RECEIPT_UNVERIFIED');
  expect(f.gmail.users.messages.get).not.toHaveBeenCalled();
  expect(f.ingest).not.toHaveBeenCalled();
});

it('retries app notification failure using the same Gmail receipt, with no send capability', async () => {
  const f = fixture();
  f.notify.mockRejectedValueOnce(new Error('Temporary notification failure'));
  await expect(f.service.syncDelivery({ deliveryId: 1 })).rejects.toThrow('Temporary notification');
  expect(await f.service.syncDelivery({ deliveryId: 1 })).toMatchObject({ status: 'ready' });
  expect(f.ingest.mock.calls.every(([call]) => call.gmailMessageId === 'gmail-verified')).toBe(true);
  expect(f.gmail.users.messages.send).toBeUndefined();
});
