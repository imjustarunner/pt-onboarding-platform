import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: { listClientsForGuardian: vi.fn(), isNoView: () => false } }));
vi.mock('../../models/CommunicationConversation.model.js', () => ({ default: { listMessages: vi.fn(), markRead: vi.fn(), addMessage: vi.fn() } }));
import pool from '../../config/database.js';
import Guardian from '../../models/ClientGuardian.model.js';
import Conversation from '../../models/CommunicationConversation.model.js';
import { listPortalEmails, getPortalEmail } from '../portalMailbox.service.js';
beforeEach(() => { vi.clearAllMocks(); Guardian.listClientsForGuardian.mockResolvedValue([{ client_id: 4 }]); pool.execute.mockResolvedValue([[]]); });
it('shares explicitly client-linked email regardless of which guardian received it', async () => {
  pool.execute.mockImplementation(async sql => sql.includes('SELECT email') ? [[{ email: 'second@example.org' }]] : sql.includes('FROM communication_conversations c') ? [[{ id: 7, subject: 'Session question' }]] : [[]]);
  const emails = await listPortalEmails({ userId: 10 });
  expect(emails[0].conversationId).toBe(7);
  const [sql, params] = pool.execute.mock.calls.find(([s]) => s.includes('FROM communication_conversations c'));
  expect(sql).toContain("cl.entity_type = 'client'"); expect(sql).toContain('NOT EXISTS'); expect(params).toEqual([10, 4, 'second@example.org']);
  expect(Guardian.listClientsForGuardian).toHaveBeenCalledWith({ guardianUserId: 10, requiredClinicalScope: 'clinical_messages' });
});
it('never includes internal notes or unsent drafts in a shared portal email', async () => {
  pool.execute.mockImplementation(async sql => sql.includes('SELECT email') ? [[{ email: 'second@example.org' }]] : sql.includes('FROM communication_conversations c') ? [[{ id: 7, subject: 'Session question', agency_id: 2 }]] : [[]]);
  Conversation.listMessages.mockResolvedValue([{ id: 1, body_text: 'Sent reply', send_status: 'sent', direction: 'outbound' }, { id: 2, body_text: 'Unsent draft', send_status: 'scheduled', direction: 'outbound' }, { id: 3, body_text: 'Internal staff note', is_internal_note: 1, direction: 'internal' }]);
  const result = await getPortalEmail({ userId: 10, conversationId: 7 });
  expect(result.messages.map(m => m.body)).toEqual(['Sent reply']); expect(Conversation.markRead).toHaveBeenCalledWith(7, 10);
});
