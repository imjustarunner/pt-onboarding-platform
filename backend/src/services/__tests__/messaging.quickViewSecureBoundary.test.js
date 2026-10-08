import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: vi.fn(async () => ({ role: 'provider' })) } }));
vi.mock('../../controllers/chat.controller.js', () => ({ listMyThreads: vi.fn(), listMessages: vi.fn(), sendMessage: vi.fn(), markRead: vi.fn(), listThreadsInbox: vi.fn(), listMentionsInbox: vi.fn(), listFilesInbox: vi.fn(), createOrGetDirectThread: vi.fn() }));
vi.mock('../../controllers/chatAttachments.controller.js', () => ({ uploadChatAttachment: vi.fn() }));
vi.mock('../../controllers/chatReactions.controller.js', () => ({ addReaction: vi.fn(), removeReaction: vi.fn() }));
import pool from '../../config/database.js';
import { listMessages, sendMessage } from '../../controllers/chat.controller.js';
import { qvListChatMessages, qvSendChatMessage, qvMarkChatRead, qvUploadChatAttachment, qvAddChatReaction, qvRemoveChatReaction } from '../../controllers/quickViewSurfaces.controller.js';
const req = () => ({ quickView: { userId: 3, agencyId: 2 }, query: {}, headers: {}, params: { threadId: 5 }, body: {} });
const res = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
beforeEach(() => { vi.clearAllMocks(); pool.execute.mockResolvedValue([[{ message_channel: 'secure' }]]); });
it('requires the secure workspace before reading, sending, marking read, or uploading', async () => {
  for (const handler of [qvListChatMessages, qvSendChatMessage, qvMarkChatRead, qvUploadChatAttachment]) {
    const response = res(), next = vi.fn(); await handler(req(), response, next);
    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json.mock.calls[0][0].error.code).toBe('SECURE_WORKSPACE_REQUIRED');
    expect(next).not.toHaveBeenCalled();
  }
  expect(listMessages).not.toHaveBeenCalled(); expect(sendMessage).not.toHaveBeenCalled();
});
it('checks the owning conversation when the request addresses a message directly', async () => {
  for (const handler of [qvAddChatReaction, qvRemoveChatReaction]) {
    const request = req(); request.params = { messageId: 7, code: 'heart' }; const response = res();
    await handler(request, response, vi.fn()); expect(response.status).toHaveBeenCalledWith(409);
    expect(pool.execute).toHaveBeenLastCalledWith(expect.stringContaining('m.thread_id = t.id'), [7]);
  }
});
it('continues to use the shared chat handler for internal conversations', async () => {
  pool.execute.mockResolvedValue([[{ message_channel: 'internal' }]]);
  const request = req(), response = res(), next = vi.fn();
  await qvListChatMessages(request, response, next);
  expect(listMessages).toHaveBeenCalledWith(request, response, next);
  expect(response.status).not.toHaveBeenCalled();
});
