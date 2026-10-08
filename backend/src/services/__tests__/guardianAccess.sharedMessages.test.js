import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../clientSecureConversation.service.js', () => ({ clientSecureAudience: vi.fn(), ensureClientSecureConversation: vi.fn() }));
import pool from '../../config/database.js';
import { clientSecureAudience, ensureClientSecureConversation } from '../clientSecureConversation.service.js';
import { sharedChildParticipants, ensureSharedChildThread, assertSharedChildThreadAccess, assertSharedGuardianSend } from '../guardianSharedMessages.service.js';
beforeEach(() => {
  vi.resetAllMocks();
  clientSecureAudience.mockResolvedValue({ client: { id: 8, agency_id: 2 }, participants: [{ id: 1 }, { id: 2 }, { id: 9 }] });
  ensureClientSecureConversation.mockResolvedValue({ threadId: 4, participants: [{ id: 1 }, { id: 2 }, { id: 9 }] });
  pool.execute.mockResolvedValue([[{ client_id: 8, agency_id: 2 }]]);
});
it('uses the same authorized audience in the guardian portal and Messages by Conversa', async () => {
  expect((await sharedChildParticipants(8, 2)).participants.map(p => p.id)).toEqual([1, 2, 9]);
  expect(clientSecureAudience).toHaveBeenCalledWith(8, pool);
});
it('rejects a request for the wrong tenant', async () => {
  await expect(sharedChildParticipants(8, 3)).rejects.toMatchObject({ status: 403 });
});
it('opens the canonical secure conversation through the existing guardian API', async () => {
  expect(await ensureSharedChildThread({ clientId: 8, agencyId: 2, userId: 1 })).toMatchObject({ threadId: 4, shared: true });
  expect(ensureClientSecureConversation).toHaveBeenCalledWith({ clientId: 8, agencyId: 2, actorUserId: 1 });
});
it('honors revoked access even when the old thread membership remains', async () => {
  ensureClientSecureConversation.mockRejectedValue(Object.assign(new Error('Access revoked'), { status: 403 }));
  await expect(assertSharedChildThreadAccess(2, 4)).rejects.toMatchObject({ status: 403 });
});
it('refreshes the shared audience before a guardian send', async () => {
  await assertSharedGuardianSend(9, 4);
  expect(ensureClientSecureConversation).toHaveBeenCalledWith({ clientId: 8, agencyId: 2, actorUserId: 9 });
});
it('blocks private client or guardian replies outside their shared secure conversation', async () => {
  pool.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ user_id: 1 }]]);
  await expect(assertSharedGuardianSend(9, 4)).rejects.toMatchObject({ status: 409 });
});
