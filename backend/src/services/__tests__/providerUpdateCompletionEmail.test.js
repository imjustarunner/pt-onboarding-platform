import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {}, onTableWrite: () => {} }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: vi.fn() }));
vi.mock('../providerUpdateEmailSender.service.js', () => ({ resolveProviderUpdateSender: vi.fn() }));
vi.mock('../providerUpdateRecipient.service.js', () => ({ resolveProviderUpdateRecipients: vi.fn() }));
import { createProviderUpdateCompletionEmails, providerUpdateCompletionMessage } from '../providerUpdateCompletionEmail.service.js';

let recipient, prior, claimed, eventType, send, release, deliver;
beforeEach(() => {
  recipient = { id: 99, agency_id: 2, provider_user_id: 507, first_name: 'Rachel',
    status: 'finalized', finalized_at: '2026-10-20', locked_at: '2026-10-20',
    active_seconds: 4046, payroll_time_claim_id: 678, agency_name: 'ITSCO', agency_slug: 'itsco',
    token: 'test-token', snapshot_json: { enabledKeys: ['contact_info'] } };
  prior = false; claimed = 1; eventType = null;
  send = vi.fn(async () => ({ id: 'sent-message', communicationId: 100 }));
  release = vi.fn();
  const connection = { release, execute: vi.fn(async (sql, args) => {
    if (sql.includes('GET_LOCK')) return [[{ acquired: claimed }]];
    if (sql.includes('FROM provider_update_recipients')) return [[recipient]];
    if (sql.includes('FROM provider_update_view_events')) return [prior ? [{ id: 1 }] : []];
    if (sql.includes('FROM provider_update_section_progress')) return [[{ section_key: 'contact_info', completed: 1 }]];
    if (sql.includes('FROM payroll_time_claims')) return [[{ user_id:507, agency_id:2, status:'submitted', payload_json:{activeSeconds:4046} }]];
    if (sql.startsWith('INSERT')) { prior = true; eventType = 'completion_receipt_sending'; return [{ insertId: 10 }]; }
    if (sql.startsWith('UPDATE')) { eventType = args[0]; return [{ affectedRows: 1 }]; }
    return [[]];
  }) };
  deliver = createProviderUpdateCompletionEmails({
    db: { getConnection: async () => connection }, sendEmail: send,
    resolveSender: async () => ({ identity:{id:6}, replyTo:'technology@itsco.health' }),
    resolveRecipients: async (_id, rows) => rows.map(row => ({ ...row, work_email:'rachel@itsco.health' }))
  });
});
it('sends a truthful receipt from Notifications with Technology replies and organization portal wording', async () => {
  await deliver(99);
  expect(send).toHaveBeenCalledWith(expect.objectContaining({
    senderIdentityId:6, replyToOverride:'technology@itsco.health', to:'rachel@itsco.health',
    templateType:'provider_update_completion_receipt', source:'auto'
  }));
  const message = send.mock.calls[0][0];
  expect(message.text).toContain('1 hour, 7 minutes, 26 seconds');
  expect(message.text).toContain('My Payroll, then Time Claims');
  expect(message.text).not.toMatch(/PlotTwist|FundThred|People Operations/i);
  expect(message.linkUrl).toBe('https://app.itsco.health/dashboard?tab=my&my=payroll#payroll-section-time_claims');
  expect(eventType).toBe('completion_receipt_sent');
  expect(release).toHaveBeenCalledOnce();
});
it('does not duplicate receipts on repeated completion or after an earlier batch receipt', async () => {
  await deliver(99); await deliver(99);
  expect(send).toHaveBeenCalledOnce();
});
it('does not send while another worker owns the receipt lock', async () => {
  claimed = 0;
  expect(await deliver(99)).toMatchObject({ reason:'receipt_in_progress' });
  expect(send).not.toHaveBeenCalled();
});
it('does not tell an incomplete recipient they are done', async () => {
  recipient.status = 'in_progress';
  expect(await deliver(99)).toMatchObject({ reason:'update_not_complete' });
  expect(send).not.toHaveBeenCalled();
});
it('does not promise a time claim for an intern when no claim exists', () => {
  recipient.payroll_time_claim_id = null;
  const message = providerUpdateCompletionMessage(recipient);
  expect(message.text).toContain('No time claim was created automatically');
  expect(message.text).not.toContain('has been submitted on your behalf');
});
it('keeps an ambiguous send reserved instead of blindly retrying', async () => {
  send.mockRejectedValueOnce(new Error('connection lost'));
  await expect(deliver(99)).rejects.toThrow('connection lost');
  expect(eventType).toBe('completion_receipt_sending');
  await deliver(99);
  expect(send).toHaveBeenCalledOnce();
  expect(release).toHaveBeenCalledTimes(2);
});
it('does not send when the time claim differs from the completed update', async () => {
  recipient.active_seconds = 1;
  await expect(deliver(99)).rejects.toThrow('claim failed validation');
  expect(send).not.toHaveBeenCalled();
});
