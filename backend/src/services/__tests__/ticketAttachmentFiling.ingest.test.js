import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), save: vi.fn(), getGmailClient: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../storage.service.js', () => ({ default: { sanitizeFilename: name => name, getGCSBucket: async () => ({ file: () => ({ save: mocks.save }) }) } }));
vi.mock('../unifiedEmail/gmailClient.js', () => ({ getGmailClient: mocks.getGmailClient }));
import { persistGmailAttachmentsForTicket } from '../unifiedEmail/ticketInboundAttachments.service.js';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.execute.mockImplementation(async sql => sql.includes('information_schema') ? [[{ cnt: 1 }]] : sql.startsWith('INSERT') ? [{ insertId: 20 }] : [[]]);
});
describe('emailed registration packets', () => {
  it('retains a 16 MB Gmail PDF attachment on its ticket without truncation', async () => {
    const buffer = Buffer.alloc(16 * 1024 * 1024, 32);
    buffer.write('%PDF-1.7');
    const gmail = { users: { messages: { attachments: { get: vi.fn().mockResolvedValue({ data: { data: buffer.toString('base64url') } }) } } } };
    const result = await persistGmailAttachmentsForTicket({ ticketId: 10, gmail, gmailMessageId: 'synthetic-message', payload: { parts: [{ filename: 'registration.pdf', mimeType: 'application/pdf', body: { attachmentId: 'synthetic-attachment', size: buffer.length } }] } });
    expect(result.saved).toBe(1);
    expect(mocks.save.mock.calls[0][0].equals(buffer)).toBe(true);
    expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO support_ticket_attachments'), [10, 'registration.pdf', expect.stringContaining('uploads/ticket_attachments/ticket_10/'), 'application/pdf', buffer.length]);
    expect(mocks.getGmailClient).not.toHaveBeenCalled();
  });
});
