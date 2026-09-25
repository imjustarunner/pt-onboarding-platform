import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), begin: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), getConnection: vi.fn(), settings: vi.fn(), encrypt: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { getConnection: m.getConnection } }));
vi.mock('../emailSettings.service.js', () => ({ getAgencyEmailSettings: m.settings }));
vi.mock('../../utils/supportTicketCrypto.js', () => ({ prepareEncryptedTicketText: m.encrypt }));
import { handleSupportKeywordReply, isSupportKeywordReply } from '../emailSupportKeyword.service.js';
const input = { agencyId: 2, conversationId: 10, fromEmail: 'sender@example.org', bodyText: 'SUPPORT\n\nOn Monday Staff wrote:\nReply with SUPPORT.' };
beforeEach(() => {
 vi.clearAllMocks();
 m.getConnection.mockResolvedValue({ execute: m.execute, beginTransaction: m.begin, commit: m.commit, rollback: m.rollback, release: m.release });
 m.settings.mockResolvedValue({ clientOooSupportKeyword: 'SUPPORT' });
 m.encrypt.mockImplementation(text => ({ plain: null, ciphertext: `encrypted:${text.length}`, iv: 'iv', authTag: 'tag', keyId: 'key' }));
 m.execute.mockImplementation(async sql => {
  if (sql.startsWith('SELECT id, support_ticket_id')) return [[{ id: 10, support_ticket_id: null }]];
  if (sql.startsWith('SELECT a.id')) return [[]];
  if (sql.startsWith('SELECT body_text')) return [[{ body_text: 'Latest request', direction: 'inbound' }, { body_text: 'Earlier context', direction: 'outbound' }]];
  if (sql.startsWith('INSERT INTO support_tickets')) return [{ insertId: 70 }];
  return [{ affectedRows: 1 }];
 });
});
it('recognizes an explicit new-line command and configurable keyword', () => {
 expect(isSupportKeywordReply(input.bodyText)).toBe(true);
 expect(isSupportKeywordReply('\n support!\nPlease help.')).toBe(true);
 expect(isSupportKeywordReply('AYUDA', 'ayuda')).toBe(true);
});
it('does not interpret ordinary text, signatures, email addresses, or quoted OOO instructions as commands', () => {
 for (const body of ['Thanks for your support.', 'Hello\nSupport team\nsupport@example.org', 'Please call support@example.org', 'Unsupported document', 'Thanks\n\nOn Monday Staff wrote:\nSUPPORT', '> SUPPORT', 'From: Staff\nSUPPORT']) expect(isSupportKeywordReply(body)).toBe(false);
});
it('does no ticket work for ordinary email', async () => {
 expect(await handleSupportKeywordReply({ ...input, bodyText: 'Thanks for your support' })).toEqual({ handled: false });
 expect(m.getConnection).not.toHaveBeenCalled();
});
it('creates an encrypted tenant ticket with all required fields and commits its conversation link', async () => {
 expect(await handleSupportKeywordReply(input)).toEqual({ handled: true, ticketId: 70 });
 const [sql, values] = m.execute.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO support_tickets'));
 expect(sql).toContain('school_organization_id');expect(sql).not.toContain('metadata_json');expect(sql).toContain("NULL, 'inbound_email'");
 expect(values).toEqual([2, 2, 'Support requested (conversation #10)', null, input.fromEmail, expect.stringMatching(/^encrypted:/), 'iv', 'tag', 'key']);
 expect(m.encrypt).toHaveBeenCalledWith(expect.stringContaining('[outbound] Earlier context\n[inbound] Latest request'));
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('SET support_ticket_id=?'), [70, 10, 2]);
 expect(m.commit).toHaveBeenCalledOnce();expect(m.release).toHaveBeenCalledOnce();
});
it('uses the linked school only through a tenant-scoped school lookup', async () => {
 const execute = m.execute.getMockImplementation();m.execute.mockImplementation(async sql => sql.startsWith('SELECT a.id') ? [[{ id: 8 }]] : execute(sql));
 await handleSupportKeywordReply(input);
 expect(m.execute.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO support_tickets'))[1][0]).toBe(8);
 const [sql, values] = m.execute.mock.calls.find(([sql]) => sql.startsWith('SELECT a.id'));
 expect(sql).toContain('oa.agency_id=?');expect(sql).toContain('s.agency_id=?');expect(values).toEqual([10, 2, 2, 2]);
});
it('reuses the ticket under the conversation lock when another delivery already created it', async () => {
 m.execute.mockResolvedValueOnce([[{ id: 10, support_ticket_id: 70 }]]);
 expect(await handleSupportKeywordReply(input)).toEqual({ handled: true, ticketId: 70, duplicate: true });
 expect(m.execute).toHaveBeenCalledOnce();expect(m.execute.mock.calls[0][0]).toContain('FOR UPDATE');expect(m.encrypt).not.toHaveBeenCalled();
});
it('does not create a ticket for a missing or different-tenant conversation', async () => {
 m.execute.mockResolvedValueOnce([[]]);
 expect(await handleSupportKeywordReply(input)).toEqual({ handled: false, reason: 'conversation_not_found' });
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('agency_id=? FOR UPDATE'), [10, 2]);expect(m.rollback).toHaveBeenCalledOnce();
});
it('rolls back when the conversation cannot be linked instead of leaving a duplicate on retry', async () => {
 const execute = m.execute.getMockImplementation();m.execute.mockImplementation(async sql => { if(sql.startsWith('UPDATE communication_conversations')) throw new Error('Link failed');return execute(sql); });
 await expect(handleSupportKeywordReply(input)).rejects.toThrow('Link failed');
 expect(m.rollback).toHaveBeenCalledOnce();expect(m.commit).not.toHaveBeenCalled();expect(m.release).toHaveBeenCalledOnce();
});
it('propagates a failed insert without attempting an incomplete fallback', async () => {
 const execute = m.execute.getMockImplementation();m.execute.mockImplementation(async sql => { if(sql.startsWith('INSERT INTO support_tickets')) throw new Error('Insert failed');return execute(sql); });
 await expect(handleSupportKeywordReply(input)).rejects.toThrow('Insert failed');
 expect(m.execute.mock.calls.filter(([sql]) => sql.startsWith('INSERT INTO support_tickets'))).toHaveLength(1);expect(m.rollback).toHaveBeenCalledOnce();
});
