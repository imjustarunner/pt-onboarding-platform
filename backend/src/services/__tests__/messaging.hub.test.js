import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../communicationDirectory.service.js', () => ({}));
vi.mock('../personalMailbox.service.js', () => ({}));
vi.mock('../secureMessagingPolicy.service.js', () => ({}));
vi.mock('../unifiedInbox.service.js', () => ({}));
vi.mock('../../controllers/chat.controller.js', () => ({}));
vi.mock('../chatEncryption.service.js', () => ({}));
vi.mock('../hubMessageQueue.service.js', () => ({}));
import pool from '../../config/database.js';
import { resolveHubEmailReplyConversation, loadHubEmailHistoryForPerson, loadEmailTimeline } from '../messagesHub.service.js';
beforeEach(() => { vi.clearAllMocks(); pool.execute.mockResolvedValue([[]]); });
describe('hub conversation boundaries', () => {
  it('new compose does not search for or reuse a matching subject', async () => {
    expect(await resolveHubEmailReplyConversation({ agencyId: 2, email: 'support@itsco.health', subject: 'Help', actorUserId: 5 })).toBeNull();
    expect(pool.execute).not.toHaveBeenCalled();
  });
  it('validates explicit replies against the actor, agency, and recipient', async () => {
    await expect(resolveHubEmailReplyConversation({ agencyId: 2, email: 'support@itsco.health', explicitConversationId: 77, actorUserId: 5 })).rejects.toMatchObject({ status: 404 });
    expect(pool.execute.mock.calls[0][1]).toEqual([77, 2, 'support@itsco.health', 5, 5]);
  });
  it('does not quote old history for a new email with the same subject', async () => {
    expect(await loadHubEmailHistoryForPerson({ agencyId: 2, actorUserId: 5, email: 'support@itsco.health', subject: 'Help' })).toEqual([]);
    expect(pool.execute).not.toHaveBeenCalled();
  });
  it('quotes only the selected conversation, never a sibling with the same subject', async () => {
    pool.execute.mockResolvedValueOnce([[
      { conversation_id: 77, body_text: 'Intended history', subject: 'Help', direction: 'inbound' },
      { conversation_id: 88, body_text: 'Unrelated history', subject: 'Help', direction: 'inbound' }
    ]]);
    const history = await loadHubEmailHistoryForPerson({ agencyId: 2, actorUserId: 5, email: 'support@itsco.health', subject: 'Help', conversationId: 77 });
    expect(history).toHaveLength(1);
    expect(history[0].bodyText).toBe('Intended history');
    expect(pool.execute.mock.calls[0][1]).toEqual([2, 77, 'support@itsco.health', 5, 5, 5]);
  });
  it('returns the full email body and scopes history to mail involving the viewer', async () => {
    const body = 'Complete email content. '.repeat(100);
    pool.execute.mockResolvedValueOnce([[{ message_id: 4, conversation_id: 77, body_text: body, direction: 'inbound' }]]).mockResolvedValueOnce([[]]);
    const rows = await loadEmailTimeline({ agencyId: 2, actorUserId: 5, email: 'support@itsco.health', conversationId: 77 });
    expect(rows[0].bodyPreview).toBe(body.trim());
    expect(pool.execute.mock.calls[0][0]).toContain('AND c.id = 77');
    expect(pool.execute.mock.calls[0][0]).toContain('c.owner_user_id = ?');
  });
});
