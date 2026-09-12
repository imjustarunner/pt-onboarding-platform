import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../storage.service.js', () => ({ default: { getGCSBucket: vi.fn() } }));
import pool from '../../config/database.js';
import StorageService from '../storage.service.js';
import { collectEmailAttachmentParts, prepareInboundAttachments, loadOutboundAttachments, readCommunicationAttachment, persistOutboundAttachments } from '../communicationAttachments.service.js';
beforeEach(() => vi.resetAllMocks());
describe('durable email attachments', () => {
  it('collects named text files inside multipart messages without treating the body as a file', () => {
    const parts = collectEmailAttachmentParts({ parts: [{ mimeType: 'text/plain', body: { data: 'body' } }, { mimeType: 'multipart/mixed', parts: [{ filename: 'notes.txt', mimeType: 'text/plain', body: { size: 3, attachmentId: 'a' } }] }] });
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({ filename: 'notes.txt', attachmentId: 'a' });
  });
  it('fetches provider bytes and stores them under an inbox-scoped key', async () => {
    const save = vi.fn(); const file = vi.fn(() => ({ save }));
    StorageService.getGCSBucket.mockResolvedValue({ file });
    const gmail = { users: { messages: { attachments: { get: vi.fn(async () => ({ data: { data: 'YWJj' } })) } } } };
    const result = await prepareInboundAttachments({ gmail, gmailMessageId: 'provider-id', inboxId: 7, payload: { filename: 'notes.txt', mimeType: 'text/plain', body: { attachmentId: 'a', size: 3 } } });
    expect(result[0].storageKey).toMatch(/^communication-attachments\/inbox-7\//);
    expect(save.mock.calls[0][0].toString()).toBe('abc');
  });
  it('fails closed when a queued file cannot be loaded', async () => {
    pool.execute.mockResolvedValue([[{ filename: 'missing.txt', storage_key: 'communication-attachments/missing' }]]);
    StorageService.getGCSBucket.mockResolvedValue({ file: () => ({ download: vi.fn(async () => { throw new Error('Not found'); }) }) });
    await expect(loadOutboundAttachments(1)).rejects.toThrow('Not found');
  });
  it('rejects arbitrary local paths', async () => {
    await expect(readCommunicationAttachment({ storage_key: '../../.env' })).rejects.toThrow('unavailable');
  });
  it('validates the whole outgoing batch before writing any files', async () => {
    await expect(persistOutboundAttachments(1, [{ contentBase64: 'YQ==', filename: 'valid.txt' }, { contentBase64: '', filename: 'bad.txt' }])).rejects.toThrow('Invalid attachment');
    expect(StorageService.getGCSBucket).not.toHaveBeenCalled();
    expect(pool.execute).not.toHaveBeenCalled();
  });
});
