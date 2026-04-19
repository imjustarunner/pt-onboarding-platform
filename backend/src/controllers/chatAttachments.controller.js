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

    const saved = await StorageService.saveWorkoutMedia({
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
