import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
import pool from '../../config/database.js';
import { defaultChatChannel, assertChatChannel, recordSecureThreadOpen, protectSecurePreview, recordSecureMessageEvent } from '../secureMessageBoundary.service.js';
import { protectQueuedMessage, openQueuedMessage } from '../secureQueuePayload.service.js';
import { assertSecureAttachmentPath } from '../secureChatAttachment.service.js';
import { resolveSecureMessageClient, recordSecureMessageInChart } from '../secureMessageRecord.service.js';
beforeEach(() => { vi.clearAllMocks(); pool.execute.mockResolvedValue([[]]); });
afterEach(() => vi.unstubAllEnvs());
describe('secure channel separation', () => {
  it('defaults family/school accounts to secure and staff to internal', async () => {
    pool.execute.mockResolvedValueOnce([[{ id: 1 }]]).mockResolvedValueOnce([[]]);
    expect(await defaultChatChannel([1, 2])).toBe('secure');
    expect(await defaultChatChannel([3, 4])).toBe('internal');
    expect(pool.execute.mock.calls[0][0]).toContain("'client_guardian'");
  });
  it('rejects changing an established secure thread into an internal message', async () => {
    pool.execute.mockResolvedValue([[{ message_channel: 'secure' }]]);
    await expect(assertChatChannel(5, 'internal')).rejects.toMatchObject({ status: 409 });
    await expect(assertChatChannel(5, 'secure')).resolves.toBeUndefined();
  });
  it('redacts body, subject, files and reactions outside the secure view', () => {
    const message = { channel: 'secure', bodyPreview: 'clinical details', subject: 'diagnosis', attachments: [{ file_url: 'secret' }], reactions: [1], meta: { subject: 'diagnosis', threadId: 5 } };
    for (const channel of [null, 'email', 'internal', 'sms']) {
      const serialized = JSON.stringify(protectSecurePreview(message, channel));
      expect(serialized).not.toContain('clinical details'); expect(serialized).not.toContain('diagnosis'); expect(serialized).not.toContain('secret');
    }
    expect(protectSecurePreview(message, 'secure')).toBe(message);
  });
  it('encrypts queued secure bodies, subjects and attachments together', () => {
    vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64', Buffer.alloc(32, 7).toString('base64'));
    const original = { channel: 'secure', body: 'clinical details', subject: 'diagnosis', payload: { clientId: 4, attachments: [{ filePath: 'sensitive-path' }] } };
    const saved = protectQueuedMessage(original);
    for (const secret of ['clinical details', 'diagnosis', 'sensitive-path']) expect(JSON.stringify(saved)).not.toContain(secret);
    expect(saved.body).toBeNull(); expect(saved.subject).toBeNull();
    expect(openQueuedMessage({ id: 2, channel: 'secure', payload_json: JSON.stringify(saved.payload) })).toMatchObject({ body: original.body, subject: original.subject, payload_json: original.payload });
  });
  it('fails closed when secure queue encryption is unavailable', () => {
    vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64', ''); vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEYS_JSON', '');
    expect(() => protectQueuedMessage({ channel: 'secure', body: 'private' })).toThrow('encryption is unavailable');
  });
  it('does not accept public, another thread’s, or another uploader’s attachment paths', () => {
    const path = `secure-messages/5/9/${'a'.repeat(48)}.enc`;
    expect(() => assertSecureAttachmentPath(path, 5, 9)).not.toThrow();
    for (const bad of [path.replace('/5/', '/6/'), path.replace('/9/', '/8/'), 'challenge_workouts/file.pdf', 'secure-messages/5/9/../../file']) expect(() => assertSecureAttachmentPath(bad, 5, 9)).toThrow();
  });
});
describe('secure record and authenticated activity', () => {
  it('never records reads for a nonparticipant', async () => {
    await expect(recordSecureThreadOpen({ threadId: 5, userId: 99, messageIds: [1] })).rejects.toMatchObject({ status: 404 });
    expect(pool.execute).toHaveBeenCalledTimes(1);
  });
  it('marks only this recipient’s notifications read and records no message content', async () => {
    pool.execute.mockResolvedValueOnce([[{ agency_id: 2, message_channel: 'secure' }]]).mockResolvedValue([{}]);
    await recordSecureThreadOpen({ threadId: 5, userId: 9, messageIds: [10, 10, -1], req: { ip: '127.0.0.1' } });
    expect(pool.execute).toHaveBeenCalledTimes(3);
    const [sql, params] = pool.execute.mock.calls[2];
    expect(sql).toContain('recipient_user_id = ?'); expect(sql).toContain('message_id IN (?)'); expect(params).toEqual([5, 9, 10]);
    expect(pool.execute.mock.calls[1][1][6]).not.toBe('127.0.0.1');
  });
  it('uses the persisted client record and rejects a different child', async () => {
    pool.execute.mockResolvedValue([[{ client_id: 4 }]]);
    expect(await resolveSecureMessageClient({ agencyId: 2, threadId: 5, clientId: 4 })).toBe(4);
    await expect(resolveSecureMessageClient({ agencyId: 2, threadId: 5, clientId: 7 })).rejects.toMatchObject({ status: 400 });
  });
  it('records the original audience with the caller’s transaction', async () => {
    const execute = vi.fn().mockResolvedValueOnce([[{ id: 9, name: 'Guardian One' }, { id: 10, name: 'Guardian Two' }]]).mockResolvedValueOnce([{ insertId: 1 }]);
    await recordSecureMessageInChart({ agencyId: 2, clientId: 4, threadId: 5, messageId: 6, senderUserId: 3, executor: { execute } });
    expect(execute.mock.calls[1][1].slice(0, 5)).toEqual([2, 4, 5, 6, 3]);
    expect(JSON.parse(execute.mock.calls[1][1][5])).toHaveLength(2);
    expect(pool.execute).not.toHaveBeenCalled();
  });
  it('propagates audit failure so the caller can roll back the secure send', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('audit unavailable'));
    await expect(recordSecureMessageEvent({ agencyId: 2, eventType: 'message_sent', executor: { execute } })).rejects.toThrow('audit unavailable');
  });
});
