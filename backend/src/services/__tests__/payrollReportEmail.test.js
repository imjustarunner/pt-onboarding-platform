import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
import { createPayrollReportEmail } from '../payrollReportEmail.service.js';

let sqlite, service, db, send, buildAttachment;
const input = (changes = {}) => ({ agencyId: 6, payrollPeriodId: 912, actorUserId: 99, trigger: 'post', buildAttachment, ...changes });
beforeEach(() => {
  vi.stubEnv('BILLING_ENCRYPTION_KEY_BASE64', Buffer.alloc(32, 7).toString('base64'));
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE agencies(id INTEGER,name TEXT);
    CREATE TABLE payroll_periods(id INTEGER,agency_id INTEGER,status TEXT,period_start TEXT,period_end TEXT,posted_at TEXT,ran_at TEXT);
    CREATE TABLE communication_inboxes(id INTEGER,agency_id INTEGER,identity_key TEXT,kind TEXT,is_active INTEGER,from_email TEXT,sender_identity_id INTEGER);
    CREATE TABLE email_sender_identities(id INTEGER,agency_id INTEGER,identity_key TEXT,is_active INTEGER,from_email TEXT);
    CREATE TABLE payroll_report_email_deliveries(id INTEGER PRIMARY KEY AUTOINCREMENT,agency_id INTEGER,payroll_period_id INTEGER,
      delivery_key TEXT,trigger_type TEXT,status TEXT,requested_by_user_id INTEGER,sender_identity_id INTEGER,recipient_email TEXT,
      attachment_filename TEXT,attachment_sha256 TEXT,attachment_payload_enc TEXT,communication_id INTEGER,message_id TEXT,error_code TEXT,sent_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(agency_id,payroll_period_id,delivery_key));
    CREATE TABLE users(id INTEGER,role TEXT,is_active INTEGER,is_archived INTEGER);
    CREATE TABLE user_agencies(user_id INTEGER,agency_id INTEGER,is_active INTEGER,has_payroll_access INTEGER);
    CREATE TABLE user_communications(id INTEGER,agency_id INTEGER,recipient_address TEXT,delivery_status TEXT,external_message_id TEXT,sent_at TEXT,delivered_at TEXT,opened_at TEXT,metadata TEXT);
    INSERT INTO users VALUES(99,'super_admin',1,0),(88,'admin',1,0),(87,'admin',1,0);
    INSERT INTO user_agencies VALUES(88,6,1,1),(87,2,1,1);
    INSERT INTO agencies VALUES(6,'Synthetic Agency'),(2,'Another Agency');
    INSERT INTO payroll_periods VALUES(912,6,'posted','2026-10-24','2026-11-06','2026-11-11 20:00:00','2026-11-11 19:00:00');
    INSERT INTO communication_inboxes VALUES(1,6,'payroll','shared',1,'payroll@agency.example',41),(2,2,'payroll','shared',1,'payroll@other.example',42);
    INSERT INTO email_sender_identities VALUES(41,6,'payroll',1,'payroll@agency.example'),(42,2,'payroll',1,'payroll@other.example');`);
  db = { execute: vi.fn(async (sql, params = []) => {
    const statement = sqlite.prepare(sql.replace(/INSERT IGNORE/g, 'INSERT OR IGNORE').replace(/CURRENT_TIMESTAMP\(3\)/g, 'CURRENT_TIMESTAMP'));
    if (/^\s*SELECT/i.test(sql)) return [statement.all(...params)];
    const result = statement.run(...params);
    return [{ affectedRows: Number(result.changes), insertId: Number(result.lastInsertRowid) }];
  }) };
  send = vi.fn().mockResolvedValue({ id: 'gmail-message', internetMessageId: '<synthetic@agency.example>', communicationId: 7 });
  buildAttachment = vi.fn().mockResolvedValue({ filename: '2026-10-24-2026-11-06.csv', csv: 'Employee,Total Pay\nSynthetic Employee,504.00' });
  service = createPayrollReportEmail({ db, send });
});
afterEach(() => { sqlite.close(); vi.unstubAllEnvs(); });

it('sends the exact reconciliation CSV once from and to the selected agency payroll mailbox, including concurrent post retries', async () => {
  const results = await Promise.all([service.deliver(input()), service.deliver(input())]);
  expect(send).toHaveBeenCalledTimes(1); expect(buildAttachment).toHaveBeenCalledTimes(1);
  expect(results.some(result => result.reused)).toBe(true);
  const options = send.mock.calls[0][0];
  expect(options).toMatchObject({ senderIdentityId: 41, to: 'payroll@agency.example', source: 'auto', templateType: 'payroll_posted_reconciliation' });
  expect(Buffer.from(options.attachments[0].contentBase64, 'base64').toString('utf8')).toBe('Employee,Total Pay\nSynthetic Employee,504.00');
  expect(options.attachments[0].filename).toBe('2026-10-24-2026-11-06.csv');
  expect(await service.status(input())).toMatchObject({ status: 'sent', configured: true, mailbox: 'payroll@agency.example' });
});

it('requires a posted period and a valid explicit resend key before creating an email attempt', async () => {
  sqlite.exec("UPDATE payroll_periods SET status='ran'");
  await expect(service.deliver(input())).rejects.toMatchObject({ status: 409, code: 'PAYROLL_MUST_BE_POSTED' });
  sqlite.exec("UPDATE payroll_periods SET status='posted'");
  await expect(service.deliver(input({ trigger: 'manual' }))).rejects.toMatchObject({ status: 400 });
  expect(sqlite.prepare('SELECT COUNT(*) count FROM payroll_report_email_deliveries').get().count).toBe(0);
  expect(send).not.toHaveBeenCalled();
});

it('deduplicates a retried manual click while allowing a separate explicit resend', async () => {
  await service.deliver(input({ trigger: 'manual', idempotencyKey: 'first-manual-click' }));
  expect(await service.deliver(input({ trigger: 'manual', idempotencyKey: 'first-manual-click' }))).toMatchObject({ status: 'sent', reused: true });
  await service.deliver(input({ trigger: 'manual', idempotencyKey: 'second-manual-click' }));
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls.every(([options]) => options.source === 'manual')).toBe(true);
});

it('records a missing or mismatched payroll route without falling back to another agency sender', async () => {
  sqlite.exec("UPDATE email_sender_identities SET agency_id=2 WHERE id=41");
  expect(await service.deliver(input())).toMatchObject({ status: 'failed', errorCode: 'PAYROLL_MAILBOX_UNAVAILABLE' });
  expect(await service.deliver(input())).toMatchObject({ status: 'failed', reused: true });
  expect(send).not.toHaveBeenCalled(); expect(buildAttachment).not.toHaveBeenCalled();
  expect(await service.status(input())).toMatchObject({ status: 'failed', configured: false });
});

it('never automatically retries an uncertain transport, and lets an explicit new manual request resend', async () => {
  send.mockRejectedValueOnce(new Error('Synthetic lost acknowledgement'));
  expect(await service.deliver(input())).toMatchObject({ status: 'delivery_unknown' });
  expect(await service.deliver(input())).toMatchObject({ status: 'delivery_unknown', reused: true });
  expect(send).toHaveBeenCalledTimes(1);
  expect(await service.deliver(input({ trigger: 'manual', idempotencyKey: 'authorized-new-resend' }))).toMatchObject({ status: 'sent' });
  expect(send).toHaveBeenCalledTimes(2);
});

it.each([
  [{ skipped: true }, 'blocked'], [{ queued: true }, 'delivery_unknown'], [{ id: 'test-message', redirected: true }, 'redirected'], [{}, 'delivery_unknown']
])('does not call a held, redirected, or unconfirmed email sent: %j', async (result, expectedStatus) => {
  send.mockResolvedValue(result);
  expect(await service.deliver(input())).toMatchObject({ status: expectedStatus });
  expect((await service.status(input())).sentAt).toBeNull();
});

it('retains preparation failure without sending partial or empty report content', async () => {
  buildAttachment.mockResolvedValue({ filename: 'report.csv', csv: '' });
  expect(await service.deliver(input())).toMatchObject({ status: 'failed', errorCode: 'PAYROLL_REPORT_EMPTY' });
  expect(send).not.toHaveBeenCalled();
});

it('preserves the exact encrypted CSV through Communications approval and reconciles the eventual send receipt', async () => {
  send.mockResolvedValue({ queued: true, pendingApproval: true, communicationId: 7 });
  await service.deliver(input());
  sqlite.exec("INSERT INTO user_communications(id,agency_id,recipient_address,delivery_status,metadata) VALUES(7,6,'payroll@agency.example','pending','{}')");
  const saved = sqlite.prepare('SELECT * FROM payroll_report_email_deliveries').get();
  expect(saved.attachment_payload_enc).not.toContain('Synthetic Employee');
  const communication = { id: 7, agency_id: 6, recipient_address: 'payroll@agency.example' };
  const attachments = await service.retryAttachments({ communication, actorUserId: 88, senderIdentityId: 41 });
  expect(attachments).toEqual(send.mock.calls[0][0].attachments);
  expect(await service.status(input())).toMatchObject({ status: 'pending_approval', communicationId: 7 });
  expect(await service.deliver(input({ trigger: 'manual', idempotencyKey: 'do-not-queue-a-second-copy' }))).toMatchObject({ status: 'pending_approval', reused: true });
  expect(send).toHaveBeenCalledTimes(1);
  sqlite.exec("UPDATE user_communications SET delivery_status='sent',external_message_id='approved-gmail-id',sent_at='2026-11-11 21:00:00'");
  expect(await service.status(input())).toMatchObject({ status: 'sent', sentAt: '2026-11-11 21:00:00' });
  expect(await service.deliver(input())).toMatchObject({ status: 'sent', reused: true });
  expect(send).toHaveBeenCalledTimes(1);
});

it('blocks queued attachment access for another agency, edited recipient, changed sender, or superseded posting', async () => {
  send.mockResolvedValue({ queued: true, pendingApproval: true, communicationId: 7 });
  await service.deliver(input());
  const communication = { id: 7, agency_id: 6, recipient_address: 'payroll@agency.example' };
  await expect(service.retryAttachments({ communication, actorUserId: 87, senderIdentityId: 41 })).rejects.toMatchObject({ status: 403 });
  await expect(service.retryAttachments({ communication: { ...communication, recipient_address: 'arbitrary@example.test' }, actorUserId: 99, senderIdentityId: 41 })).rejects.toMatchObject({ code: 'PAYROLL_REPORT_ROUTE_CHANGED' });
  await expect(service.retryAttachments({ communication, actorUserId: 99, senderIdentityId: 42 })).rejects.toMatchObject({ code: 'PAYROLL_REPORT_ROUTE_CHANGED' });
  sqlite.exec("UPDATE payroll_periods SET posted_at='2026-11-12 20:00:00'");
  await expect(service.retryAttachments({ communication, actorUserId: 99, senderIdentityId: 41 })).rejects.toMatchObject({ code: 'PAYROLL_REPORT_POST_CHANGED' });
});

it('revokes an abandoned preparation before an explicit retry and prevents the old process from sending after it resumes', async () => {
  let resume;
  const attachment = await buildAttachment();
  const first = service.deliver(input({ buildAttachment: () => new Promise(resolve => { resume = resolve; }) }));
  while (!resume) await Promise.resolve();
  sqlite.exec("UPDATE payroll_report_email_deliveries SET updated_at='2000-01-01 00:00:00'");
  expect(await service.status(input())).toMatchObject({ status: 'failed', errorCode: 'PAYROLL_REPORT_PREPARATION_INTERRUPTED' });
  expect(await service.deliver(input({ trigger: 'manual', idempotencyKey: 'replace-crashed-preparation' }))).toMatchObject({ status: 'sent' });
  resume(attachment);
  expect(await first).toMatchObject({ status: 'failed', errorCode: 'PAYROLL_REPORT_PREPARATION_INTERRUPTED' });
  expect(send).toHaveBeenCalledTimes(1);
});

it('rejects a new manual send while another preparation is active', async () => {
  let resume;
  const attachment = await buildAttachment();
  const first = service.deliver(input({ buildAttachment: () => new Promise(resolve => { resume = resolve; }) }));
  while (!resume) await Promise.resolve();
  await expect(service.deliver(input({ trigger: 'manual', idempotencyKey: 'another-click-during-preparation' }))).rejects.toMatchObject({ code: 'PAYROLL_REPORT_IN_PROGRESS' });
  resume(attachment); await first;
  expect(send).toHaveBeenCalledTimes(1);
});

it('allows a replacement after a canceled approval but never calls it sent', async () => {
  send.mockResolvedValueOnce({ pendingApproval: true, queued: true, communicationId: 7 });
  await service.deliver(input());
  sqlite.exec("INSERT INTO user_communications(id,agency_id,recipient_address,delivery_status,metadata) VALUES(7,6,'payroll@agency.example','canceled','{}')");
  expect(await service.status(input())).toMatchObject({ status: 'blocked', errorCode: 'EMAIL_APPROVAL_CANCELED' });
  expect(await service.deliver(input({ trigger: 'manual', idempotencyKey: 'replace-canceled-approval' }))).toMatchObject({ status: 'sent' });
});

it('exposes missing delivery schema honestly without trying transport', async () => {
  db.execute.mockImplementation(async sql => {
    if (sql.includes('payroll_report_email_deliveries')) throw Object.assign(new Error('Synthetic missing table'), { code: 'ER_NO_SUCH_TABLE' });
    if (sql.includes('communication_inboxes')) return [[{ from_email: 'payroll@agency.example', sender_identity_id: 41 }]];
    if (sql.includes('FROM payroll_periods')) return [[{ id: 912, agency_id: 6, status: 'posted' }]];
    return [[]];
  });
  expect(await service.status(input())).toMatchObject({ status: 'unavailable' });
  await expect(service.deliver(input())).rejects.toMatchObject({ status: 503 });
  await expect(service.deliver(input({ trigger: 'manual', idempotencyKey: 'manual-missing-schema' }))).rejects.toMatchObject({ status: 503 });
  expect(send).not.toHaveBeenCalled();
});
