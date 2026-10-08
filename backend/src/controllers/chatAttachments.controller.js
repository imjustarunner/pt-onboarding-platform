import { refreshClientSecureAccess } from '../services/clientSecureConversation.service.js';
import { recordSecureMessageEvent } from '../services/secureMessageBoundary.service.js';
import { saveSecureChatAttachment, readSecureChatAttachment } from '../services/secureChatAttachment.service.js';
import { resolveClientRecordAccess } from '../services/clientRecordAccess.service.js';
import pool from '../config/database.js';
import StorageService from '../services/storage.service.js';

/**
 * POST /api/chat/threads/:threadId/attachments  (multipart, field: file)
 *
 * Stages an attachment for the thread by uploading the file to /uploads and
 * returning a payload the client can drop into the next sendMessage call as
 * `attachments: [{ filePath, mimeType, kind, ... }]`.
 *
 * Reuses the same disk uploader as workout/comment attachments. We do NOT
 * insert a chat_message_attachments row here — the row is written when the
 * actual message is sent (so an abandoned upload doesn't leak rows).
 */
export const uploadChatAttachment = async (req, res, next) => {
  try {
    const threadId = parseInt(req.params.threadId, 10);
    if (!threadId) return res.status(400).json({ error: { message: 'threadId is required' } });
    if (!req.file) return res.status(400).json({ error: { message: 'file is required' } });

    await refreshClientSecureAccess(threadId, req.user.id);
    const [threads] = await pool.execute('SELECT message_channel FROM chat_threads WHERE id = ?', [threadId]);
    // Verify caller participates in the thread.
    const [parts] = await pool.execute(
      'SELECT 1 FROM chat_thread_participants WHERE thread_id = ? AND user_id = ? LIMIT 1',
      [threadId, req.user.id]
    );
    if (!parts.length) {
      return res.status(403).json({ error: { message: 'Access denied to this chat thread' } });
    }

    const mime = String(req.file.mimetype || '').toLowerCase();
    const isImage = mime.startsWith('image/');
    const isGif = mime === 'image/gif';
    const isVideo = mime.startsWith('video/');
    const kind = isGif ? 'gif' : isImage ? 'image' : isVideo ? 'video' : 'file';

    const saved = threads[0]?.message_channel === 'secure'
      ? await saveSecureChatAttachment({ threadId, userId: req.user.id, buffer: req.file.buffer })
      : await StorageService.saveWorkoutMedia({
      userId: req.user.id,
      fileBuffer: req.file.buffer,
      filename: req.file.originalname || `chat-${Date.now()}`,
      contentType: mime || 'application/octet-stream'
    });

    return res.status(201).json({
      filePath: saved.relativePath,
      mimeType: mime || null,
      kind,
      originalFilename: req.file.originalname || null,
      byteSize: req.file.size || null
    });
  } catch (e) {
    next(e);
  }
};

export async function downloadSecureChatAttachment(req, res, next) {
  try {
    const [rows] = await pool.execute(
      `SELECT a.*, m.thread_id, t.agency_id, t.client_id FROM chat_message_attachments a
       JOIN chat_messages m ON m.id = a.message_id JOIN chat_threads t ON t.id = m.thread_id
       WHERE a.id = ? AND t.message_channel = 'secure'`, [req.params.attachmentId]);
    const attachment = rows[0];
    if (!attachment) return res.status(404).json({ error: { message: 'Attachment not found' } });
    let allowed = false;
    try {
      await refreshClientSecureAccess(attachment.thread_id, req.user.id);
      const [members] = await pool.execute('SELECT 1 FROM chat_thread_participants WHERE thread_id = ? AND user_id = ?', [attachment.thread_id, req.user.id]);
      allowed = members.length > 0;
    } catch (e) { if (![403, 404].includes(e.status)) throw e; }
    if (!allowed && attachment.client_id && !['client', 'client_guardian', 'school_staff'].includes(req.user.role)) {
      const access = await resolveClientRecordAccess({ userId: req.user.id, role: req.user.role, clientId: attachment.client_id });
      allowed = access.ok;
    }
    if (!allowed) return res.status(403).json({ error: { message: 'Secure attachment access denied' } });
    if (['client', 'client_guardian'].includes(req.user.role)) {
      const { requireGuardianThreadDisclosure } = await import('../services/guardianClinicalAccess.service.js');
      await requireGuardianThreadDisclosure(req.user.id, attachment.thread_id);
    }
    const buffer = await readSecureChatAttachment(attachment.file_path);
    await recordSecureMessageEvent({ agencyId: attachment.agency_id, threadId: attachment.thread_id, messageId: attachment.message_id, userId: req.user.id, eventType: 'attachment_opened', req });
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.attachment(attachment.original_filename || 'Secure attachment');
    res.type('application/octet-stream').send(buffer);
  } catch (e) { next(e); }
}
