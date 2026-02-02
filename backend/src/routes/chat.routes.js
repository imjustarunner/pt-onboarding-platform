import express from 'express';
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

const router = express.Router();
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

export default router;

