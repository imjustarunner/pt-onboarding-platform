import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: vi.fn(async () => null) } }));
vi.mock('../../models/ClientGuardian.model.js', () => ({ default: {} }));
vi.mock('../../models/Notification.model.js', () => ({ default: {} }));
vi.mock('../../services/secureChatAttachment.service.js', () => ({ assertSecureAttachmentPath: vi.fn() }));
vi.mock('../../services/secureMessageRecord.service.js', () => ({ resolveSecureMessageClient: vi.fn(), recordSecureMessageInChart: vi.fn() }));
vi.mock('../../services/clientSecureConversation.service.js', () => ({ ensureClientSecureConversation: vi.fn(), resolveClientForSecureRecipients: vi.fn(), refreshClientSecureAccess: vi.fn() }));
vi.mock('../../services/teamMeetingStart.service.js', () => ({ startAdhocTeamMeeting: vi.fn() }));
import pool from '../../config/database.js';
import { unsendMessage, listMessages } from '../chat.controller.js';

let hasViews, hasViewsTable, messageAccessible;
beforeEach(() => {
  vi.resetAllMocks(); hasViews = true; hasViewsTable = true; messageAccessible = true;
  pool.execute.mockImplementation(async (sql, params) => {
    if (sql.includes('information_schema.tables')) return [params?.[0] === 'chat_message_views' && hasViewsTable ? [{ 1: 1 }] : []];
    if (sql.includes('information_schema.columns')) return [[]];
    if (sql.includes('SELECT DISTINCT message_id FROM chat_message_views')) return [hasViews ? [{ message_id: 20 }] : []];
    if (sql.includes('SELECT last_read_message_id')) return [[{ last_read_message_id: 19 }]];
    if (sql.startsWith('SELECT id,thread_id FROM chat_messages WHERE id=?')) return [Number(params?.[0]) === 20 ? [{ id:20, thread_id:10 }] : []];
    if (sql.startsWith('SELECT m.id FROM chat_messages m')) return [messageAccessible && Number(params?.[0]) === 7 && Number(params?.[1]) === 20 ? [{ id:20 }] : []];
    if (sql.startsWith('SELECT 1 FROM chat_thread_participants')) return [Number(params?.[0]) === 10 && Number(params?.[1]) === 7 ? [{ 1:1 }] : []];
    if (sql.includes('SELECT message_channel FROM chat_threads')) return [[{ message_channel: 'internal' }]];
    if (sql.includes('SELECT user_id FROM chat_thread_participants')) return [[{ user_id: 9 }]];
    if (sql.includes('SELECT id, thread_id, sender_user_id, body')) return [[{ id: 20, thread_id: 10, sender_user_id: 7, body: 'Team notice' }]];
    if (sql.startsWith('SELECT m.id, m.thread_id, m.sender_user_id')) return [messageAccessible && Number(params?.[0]) === 7 && Number(params?.[1]) === 10 ? [{ id:20, thread_id:10, sender_user_id:7, body:'Team notice' }] : []];
    return [[]];
  });
});
vi.mock('../../services/secureMessageBoundary.service.js', () => ({ defaultChatChannel: vi.fn(), recordSecureMessageEvent: vi.fn(), recordSecureThreadOpen: vi.fn(async () => 'internal') }));
async function invoke(handler) {
  const req = { params: { threadId: '10', messageId: '20' }, user: { id: 7, role: 'provider' }, query: {} };
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), set: vi.fn() }, next = vi.fn();
  await handler(req, res, next); return { res, next };
}
describe('Pulse views and existing message receipts', () => {
  it('prevents unsend after a recorded view even when the unread cursor is behind', async () => {
    const { res, next } = await invoke(unsendMessage);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(pool.execute.mock.calls.some(([sql]) => sql.startsWith('DELETE FROM chat_messages'))).toBe(false);
  });
  it('includes actual views in the existing sender checkmark', async () => {
    const { res, next } = await invoke(listMessages);
    expect(next).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0][0]).toMatchObject({ id: 20, is_read_by_other: true });
  });
  it('keeps unread receipts when no one has viewed the message', async () => {
    hasViews = false;
    const { res, next } = await invoke(listMessages);
    expect(next).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0][0]).toMatchObject({ id: 20, is_read_by_other: false });
  });
  it('keeps message loading working before the additive migration is applied', async () => {
    hasViewsTable = false;
    const { res, next } = await invoke(listMessages);
    expect(next).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0][0]).toMatchObject({ id: 20, is_read_by_other: false });
    expect(pool.execute.mock.calls.some(([sql]) => sql.includes('SELECT DISTINCT message_id FROM chat_message_views'))).toBe(false);
  });
  it('does not use a valid thread membership to bypass message access before unsending', async () => {
    messageAccessible = false;
    const { next } = await invoke(unsendMessage);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({status:404,code:'SECURE_MESSAGE_NOT_AVAILABLE'}));
    expect(pool.execute.mock.calls.some(([sql]) => sql.startsWith('DELETE FROM chat_messages'))).toBe(false);
    expect(pool.execute.mock.calls.some(([sql]) => sql.startsWith('SELECT id, thread_id, sender_user_id, body'))).toBe(false);
  });
});
