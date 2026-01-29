import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { deleteMessageLog, deleteThread, getRecentMessages, getThread, sendMessage } from '../controllers/message.controller.js';

const router = express.Router();

router.use(authenticate);

// Recent texts (scoped to authenticated user)
router.get('/recent', getRecentMessages);

// Thread for a specific (user, client)
router.get('/thread/:userId/:clientId', getThread);

// Send outbound message (masked) via Twilio
router.post('/send', sendMessage);

// Permanently delete an entire thread (all logs for this user+client)
router.delete('/thread/:clientId', deleteThread);

// Permanently delete a single message log (owned by user)
router.delete('/log/:id', deleteMessageLog);

export default router;

