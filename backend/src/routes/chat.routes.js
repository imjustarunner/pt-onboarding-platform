import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { listMyThreads, createOrGetDirectThread, listMessages, sendMessage, unsendMessage, markRead, getThreadMeta } from '../controllers/chat.controller.js';

const router = express.Router();
router.use(authenticate);

router.get('/threads', listMyThreads);
router.post('/threads/direct', createOrGetDirectThread);
router.get('/threads/:threadId/meta', getThreadMeta);
router.get('/threads/:threadId/messages', listMessages);
router.post('/threads/:threadId/messages', sendMessage);
router.delete('/threads/:threadId/messages/:messageId', unsendMessage);
router.post('/threads/:threadId/read', markRead);

export default router;

