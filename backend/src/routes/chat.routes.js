import express from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  bulkDeleteForMe,
  createGroupThread,
  createOrGetDirectThread,
  deleteForMe,
  deleteThreadForMe,
  getThreadMeta,
  listMessages,
  listMyThreads,
  markRead,
  sendMessage,
  unsendMessage
} from '../controllers/chat.controller.js';
import { uploadChatAttachment } from '../controllers/chatAttachments.controller.js';
import {
  addReaction,
  removeReaction,
  listReactions
} from '../controllers/chatReactions.controller.js';

const router = express.Router();

const chatAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/gif', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp',
      'video/mp4', 'video/webm', 'video/quicktime'
    ];
    if (!allowed.includes(String(file.mimetype || '').toLowerCase())) {
      cb(new Error('Only image (gif/png/jpg/webp) or video (mp4/webm/mov) files are allowed'));
      return;
    }
    cb(null, true);
  }
});

router.use(authenticate);

router.get('/threads', listMyThreads);
router.post('/threads/direct', createOrGetDirectThread);
router.post('/threads/group', createGroupThread);
router.get('/threads/:threadId/meta', getThreadMeta);
router.post('/threads/:threadId/delete-for-me', deleteThreadForMe);
router.get('/threads/:threadId/messages', listMessages);
router.post('/threads/:threadId/messages', sendMessage);
router.post('/threads/:threadId/messages/delete-for-me', bulkDeleteForMe);
router.delete('/threads/:threadId/messages/:messageId', unsendMessage);
router.post('/threads/:threadId/messages/:messageId/delete-for-me', deleteForMe);
router.post('/threads/:threadId/read', markRead);

router.post(
  '/threads/:threadId/attachments',
  chatAttachmentUpload.single('file'),
  uploadChatAttachment
);

router.get('/messages/:messageId/reactions', listReactions);
router.post('/messages/:messageId/reactions', addReaction);
router.delete('/messages/:messageId/reactions/:code', removeReaction);

export default router;

