import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../credentialingAccess.service.js', () => ({ requireCredentialingAccess: vi.fn(), canAccessCredentialing: vi.fn(async () => true) }));
vi.mock('../storage.service.js', () => ({ default: {} }));
vi.mock('../supportTicketEmailInbound.service.js', () => ({ ingestSupportTicketEmail: vi.fn() }));
vi.mock('../unifiedEmail/ticketInboundAttachments.service.js', () => ({ listTicketAttachments: vi.fn(async () => []), getTicketAttachmentRow: vi.fn(), readTicketAttachmentBuffer: vi.fn() }));
import { credentialingSubject, credentialingCaseEmail, ingestCredentialingEmail, createCredentialingReminder, savePayerDocument, readPayerDocument, processCredentialingReminders } from '../credentialingOperations.service.js';
import { decryptChatText } from '../chatEncryption.service.js';

const user = { id: 7, role: 'staff' };
function fixture() {
  const transaction = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async () => [{ insertId: 9, affectedRows: 1 }]) };
  const d = { authorize: vi.fn(async () => {}), database: { getConnection: vi.fn(async () => transaction), execute: vi.fn(async sql => {
    if (sql.includes('FROM user_insurance_credentialing c') || sql.includes('FROM insurance_credentialing_definitions p')) return [[{ id: 3, name: 'Payer', user_id: 40 }]];
    return [[]];
  }) }, storage: { saveComplianceDocument: vi.fn(async () => ({ relativePath: 'credentials/test.enc' })), readObjectBuffer: vi.fn(), deleteLifecycleChecklistAttachment: vi.fn(async () => {}) } };
  return { d, transaction };
}
beforeEach(() => { process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 5).toString('base64'); });

describe('credentialing subjects and optional receive-only email', () => {
  it('rejects authorization before looking up sensitive records', async () => {
    const { d } = fixture(); d.authorize.mockRejectedValue(Object.assign(new Error('Denied'), { status: 403 }));
    await expect(credentialingSubject(user, 1, 'payer', 3, d)).rejects.toMatchObject({ status: 403 });
    expect(d.database.execute).not.toHaveBeenCalled();
  });
  it('requires the record to belong to the selected agency', async () => {
    const { d } = fixture(); d.database.execute.mockResolvedValue([[]]);
    await expect(credentialingSubject(user, 2, 'provider', 3, d)).rejects.toMatchObject({ status: 404 });
    expect(d.database.execute.mock.calls[0][1]).toEqual([2, 3]);
  });
  it('never creates email or checks provisioning during a read', async () => {
    const { d } = fixture(); expect(await credentialingCaseEmail(user, 1, 3, false, d)).toEqual({ mailbox: null });
    expect(d.database.getConnection).not.toHaveBeenCalled();
    expect(d.database.execute.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
    expect(d.database.execute.mock.calls.some(([sql]) => sql.includes('email_sender_identities'))).toBe(false);
  });
  it('reuses an existing case address even when create is clicked again', async () => {
    const { d } = fixture(); d.database.execute.mockImplementation(async sql => sql.includes('FROM credentialing_case_emails') ? [[{ id: 2, emailAddress: 'app+cred-existing@practice.example' }]] : [[{ id: 3 }]]);
    expect((await credentialingCaseEmail(user, 1, 3, true, d)).mailbox.id).toBe(2);
    expect(d.database.getConnection).not.toHaveBeenCalled();
  });
  it('does not advertise an address without a configured receiving app route', async () => {
    const { d } = fixture(); await expect(credentialingCaseEmail(user, 1, 3, true, d)).rejects.toMatchObject({ status: 409 });
    expect(d.database.getConnection).not.toHaveBeenCalled();
  });
  it('creates an opaque address for only the explicitly selected case and audits it atomically', async () => {
    const { d, transaction } = fixture(); const read = d.database.execute.getMockImplementation();
    d.database.execute.mockImplementation(async sql => sql.includes('JOIN email_inbound_routes') ? [[{ id: 8, from_email: 'app@practice.example' }]] : read(sql));
    transaction.execute.mockImplementation(async sql => sql.startsWith('SELECT') ? [[{ id: 9, emailAddress: 'stored-address' }]] : [{ insertId: 9, affectedRows: 1 }]);
    await credentialingCaseEmail(user, 1, 3, true, d);
    const insert = transaction.execute.mock.calls.find(([sql]) => sql.includes('INSERT IGNORE INTO credentialing_case_emails'));
    expect(insert[1].slice(0, 3)).toEqual([1, 3, 8]); expect(insert[1][3]).toMatch(/^app\+cred-[a-f0-9]{32}@practice\.example$/);
    expect(transaction.execute.mock.calls.some(([sql]) => sql.includes('credentialing_workflow_events'))).toBe(true); expect(transaction.commit).toHaveBeenCalled();
  });
  it('routes exact case recipients through the existing encrypted ticket intake with no draft or sender', async () => {
    const address = `app+cred-${'b'.repeat(32)}@practice.example`, ingest = vi.fn(async () => ({ ticketId: 44 }));
    const database = { execute: vi.fn(async () => [[{ id: 9, agency_id: 1, credential_id: 3, email_address: address }]]) };
    expect(await ingestCredentialingEmail({ addresses: [address], fromEmail: 'payer@example.com', bodyText: 'United credentialing' }, { database, ingest })).toMatchObject({ ingested: true, ticketId: 44 });
    expect(ingest).toHaveBeenCalledWith(expect.objectContaining({ agencyId: 1, credentialingCaseEmailId: 9, recipients: [address], topic: 'credentialing', generateDraft: false, staffCopy: false, createdByUserId: null }));
  });
  it('never guesses a case from a subject or sender and rejects unknown or ambiguous addresses', async () => {
    const database = { execute: vi.fn(async () => [[]]) }, ingest = vi.fn();
    expect(await ingestCredentialingEmail({ addresses: ['app@practice.example'], subject: 'United provider renewal' }, { database, ingest })).toEqual({ ingested: false });
    expect(database.execute).not.toHaveBeenCalled();
    await expect(ingestCredentialingEmail({ addresses: [`app+cred-${'c'.repeat(32)}@practice.example`] }, { database, ingest })).rejects.toMatchObject({ status: 409 });
    database.execute.mockResolvedValue([[{ id: 1 }, { id: 2 }]]);
    await expect(ingestCredentialingEmail({ addresses: [`app+cred-${'c'.repeat(32)}@practice.example`] }, { database, ingest })).rejects.toMatchObject({ status: 409 });
    expect(ingest).not.toHaveBeenCalled();
  });
});

describe('encrypted payer documents', () => {
  it('stores encrypted bytes and atomically records metadata and audit, without a public URL', async () => {
    const { d, transaction } = fixture(); const file = { buffer: Buffer.from('%PDF-private fee schedule'), originalname: 'fees.pdf', mimetype: 'application/pdf' };
    expect(await savePayerDocument(user, 1, 3, { title: '2027 fees', documentType: 'fee_schedule' }, file, d)).toEqual({ id: 9 });
    const encrypted = d.storage.saveComplianceDocument.mock.calls[0][0]; expect(encrypted.toString()).not.toContain('private fee schedule');
    expect(Buffer.from(decryptChatText(JSON.parse(encrypted)), 'base64')).toEqual(file.buffer);
    expect(transaction.commit).toHaveBeenCalled();
  });
  it('fails closed without encryption and rejects executable uploads', async () => {
    const { d } = fixture(); const file = { buffer: Buffer.from('sensitive'), originalname: 'fees.pdf', mimetype: 'application/pdf' };
    process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64 = '';
    await expect(savePayerDocument(user, 1, 3, { title: 'Fees', documentType: 'fee_schedule' }, file, d)).rejects.toThrow();
    await expect(savePayerDocument(user, 1, 3, { title: 'Fees', documentType: 'fee_schedule' }, { ...file, mimetype: 'text/html' }, d)).rejects.toMatchObject({ status: 400 });
    expect(d.storage.saveComplianceDocument).not.toHaveBeenCalled();
  });
  it('never downloads storage for a cross-payer document ID', async () => {
    const { d } = fixture(); await expect(readPayerDocument(user, 1, 3, 999, d)).rejects.toMatchObject({ status: 404 }); expect(d.storage.readObjectBuffer).not.toHaveBeenCalled();
  });
  it('removes the new reproducible object if metadata or auditing fails', async () => {
    const { d, transaction } = fixture(); transaction.execute.mockRejectedValue(new Error('audit unavailable'));
    await expect(savePayerDocument(user, 1, 3, { title: 'Fees', documentType: 'fee_schedule' }, { buffer: Buffer.from('fees'), mimetype: 'application/pdf' }, d)).rejects.toThrow('audit unavailable');
    expect(transaction.rollback).toHaveBeenCalled(); expect(d.storage.deleteLifecycleChecklistAttachment).toHaveBeenCalledWith('credentials/test.enc');
  });
});

describe('credentialing team reminders', () => {
  it('requires an explicit future UTC instant and audits scheduling', async () => {
    const { d, transaction } = fixture();
    for (const remindAt of ['2026-01-01T10:00', 'invalid', '2000-01-01T10:00:00Z']) await expect(createCredentialingReminder(user, 1, 'provider', 3, { title: 'Renew', remindAt }, d)).rejects.toMatchObject({ status: 400 });
    await createCredentialingReminder(user, 1, 'provider', 3, { title: 'Renew', remindAt: '2099-01-01T10:00:00Z' }, d); expect(transaction.commit).toHaveBeenCalledTimes(1);
  });
  it('keeps overdue reminders pending if no authorized team member can receive them', async () => {
    const { d, transaction } = fixture(); transaction.execute.mockImplementation(async sql => sql.includes('FOR UPDATE SKIP LOCKED') ? [[{ id: 4, agency_id: 1, subject_type: 'payer', record_id: 3, title: 'Renew' }]] : [[]]);
    expect(await processCredentialingReminders({ database: d.database })).toEqual({ delivered: 0 });
    expect(transaction.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE credentialing_reminders'))).toBe(false);
  });
  it('locks due reminders and commits notification delivery with the delivered status', async () => {
    const { d, transaction } = fixture(); transaction.execute.mockImplementation(async sql => sql.includes('FOR UPDATE SKIP LOCKED') ? [[{ id: 4, agency_id: 1, subject_type: 'payer', record_id: 3, title: 'Renew' }]] : sql.includes('SELECT DISTINCT u.id') ? [[{ id: 7 }]] : [{ insertId: 8 }]);
    expect(await processCredentialingReminders({ database: d.database })).toEqual({ delivered: 1 });
    const notification = transaction.execute.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO notifications'));
    expect(notification[1]).toEqual(['credentialing_reminder', 'Renew', 'Open credentialing to review this item.', 7, 1, 'credentialing_payer', 3]);
    expect(transaction.commit).toHaveBeenCalledTimes(1);
  });
});
