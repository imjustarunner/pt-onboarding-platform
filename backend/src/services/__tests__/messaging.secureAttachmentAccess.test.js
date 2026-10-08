import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../clientSecureConversation.service.js', () => ({ refreshClientSecureAccess: vi.fn() }));
vi.mock('../clientRecordAccess.service.js', () => ({ resolveClientRecordAccess: vi.fn() }));
vi.mock('../secureChatAttachment.service.js', () => ({ readSecureChatAttachment: vi.fn(), saveSecureChatAttachment: vi.fn() }));
vi.mock('../secureMessageBoundary.service.js', () => ({ recordSecureMessageEvent: vi.fn() }));
vi.mock('../guardianClinicalAccess.service.js', () => ({ requireGuardianThreadDisclosure: vi.fn() }));
import pool from '../../config/database.js';
import { refreshClientSecureAccess } from '../clientSecureConversation.service.js';
import { resolveClientRecordAccess } from '../clientRecordAccess.service.js';
import { readSecureChatAttachment } from '../secureChatAttachment.service.js';
import { recordSecureMessageEvent } from '../secureMessageBoundary.service.js';
import { downloadSecureChatAttachment } from '../../controllers/chatAttachments.controller.js';
const res = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn(), set: vi.fn().mockReturnThis(), attachment: vi.fn().mockReturnThis(), type: vi.fn().mockReturnThis(), send: vi.fn() });
beforeEach(() => { vi.clearAllMocks(); pool.execute.mockResolvedValueOnce([[{ id: 6, thread_id: 5, agency_id: 2, client_id: 4, message_id: 7, file_path: 'secure-messages/5/3/asset.enc', original_filename: 'Document.pdf' }]]).mockResolvedValue([[]]); readSecureChatAttachment.mockResolvedValue(Buffer.from('Protected attachment')); resolveClientRecordAccess.mockResolvedValue({ ok: false }); });
it('denies a revoked guardian before reading or decrypting the file', async () => {
  refreshClientSecureAccess.mockRejectedValueOnce(Object.assign(new Error('Revoked'), { status: 403 })); const response = res();
  await downloadSecureChatAttachment({ user: { id: 9, role: 'client_guardian' }, params: { attachmentId: 6 } }, response, vi.fn());
  expect(response.status).toHaveBeenCalledWith(403); expect(readSecureChatAttachment).not.toHaveBeenCalled(); expect(resolveClientRecordAccess).not.toHaveBeenCalled();
});
it('allows an authorized participant, logs the opening, and disables browser caching', async () => {
  pool.execute.mockResolvedValueOnce([[{ id: 1 }]]); const response = res(), next = vi.fn();
  await downloadSecureChatAttachment({ user: { id: 9, role: 'client_guardian' }, params: { attachmentId: 6 } }, response, next);
  expect(next).not.toHaveBeenCalled(); expect(response.send).toHaveBeenCalledWith(Buffer.from('Protected attachment'));
  expect(recordSecureMessageEvent).toHaveBeenCalledWith(expect.objectContaining({ messageId: 7, userId: 9, eventType: 'attachment_opened' })); expect(response.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
});
it('permits record-authorized clinicians to retrieve a retained chart attachment', async () => {
  refreshClientSecureAccess.mockRejectedValueOnce(Object.assign(new Error('Not participant'), { status: 403 })); resolveClientRecordAccess.mockResolvedValueOnce({ ok: true }); const response = res();
  await downloadSecureChatAttachment({ user: { id: 11, role: 'provider' }, params: { attachmentId: 6 } }, response, vi.fn());
  expect(resolveClientRecordAccess).toHaveBeenCalledWith({ userId: 11, role: 'provider', clientId: 4 }); expect(response.send).toHaveBeenCalled();
});
