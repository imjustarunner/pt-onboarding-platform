import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../storage.service.js', () => ({ default: { getGCSBucket: vi.fn() } }));
import pool from '../../config/database.js';
import {encryptSupportAttachment} from '../supportTicketUploads.service.js';
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
  it('downloads the recorded ticket attachment mirrored into a shared inbox without a second storage copy', async () => {
    const path = 'uploads/ticket_attachments/ticket_70/gmail-verified-payroll.csv';
    pool.execute.mockResolvedValue([[{ id: 9, ticket_id: 70, file_path: path }]]);
    const file = vi.fn(() => ({ exists: async () => [true], download: async () => [Buffer.from('payroll-csv')] }));
    StorageService.getGCSBucket.mockResolvedValue({ file });
    expect((await readCommunicationAttachment({ storage_key: path })).toString()).toBe('payroll-csv');
    expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('ticket_id=? AND file_path=?'), [70, path]);
    expect(file).toHaveBeenCalledWith(path);
  });
  it('rejects unrecorded ticket storage paths', async () => {
    pool.execute.mockResolvedValue([[]]);
    await expect(readCommunicationAttachment({ storage_key: 'uploads/ticket_attachments/ticket_70/guessed.csv' })).rejects.toThrow('unavailable');
    expect(StorageService.getGCSBucket).not.toHaveBeenCalled();
  });
  it('validates the whole outgoing batch before writing any files', async () => {
    await expect(persistOutboundAttachments(1, [{ contentBase64: 'YQ==', filename: 'valid.txt' }, { contentBase64: '', filename: 'bad.txt' }])).rejects.toThrow('Invalid attachment');
    expect(StorageService.getGCSBucket).not.toHaveBeenCalled();
    expect(pool.execute).not.toHaveBeenCalled();
  });
});

it('reads a recorded encrypted ticket file through its exact mirrored agency/ticket identity',async()=>{vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,6).toString('base64'));try{const path='private-ticket-attachments/450/553/'+ 'a'.repeat(64)+'.ticket.enc',bytes=Buffer.from('%PDF-synthetic');pool.execute.mockImplementation(async sql=>sql.startsWith('SELECT a.*')?[[{id:7,ticket_id:553,file_path:path}]]:[[{agency_id:450}]]);StorageService.getGCSBucket.mockResolvedValue({file:()=>({exists:async()=>[true],download:async()=>[encryptSupportAttachment(bytes,{ticketId:553,agencyId:450})]})});expect(await readCommunicationAttachment({storage_key:path})).toEqual(bytes);expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('a.ticket_id=? AND t.agency_id=? AND a.file_path=?'),[553,450,path]);}finally{vi.unstubAllEnvs();}});
it('rejects an unrecorded private ticket path without opening storage',async()=>{pool.execute.mockResolvedValue([[]]);await expect(readCommunicationAttachment({storage_key:'private-ticket-attachments/999/553/'+'b'.repeat(64)+'.ticket.enc'})).rejects.toThrow('unavailable');expect(StorageService.getGCSBucket).not.toHaveBeenCalled();});
