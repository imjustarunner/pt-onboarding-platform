import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { getRecentMessages, getThread, sendMessage } from '../controllers/message.controller.js';

const router = express.Router();

router.use(authenticate);

// Support Safety Net feed ("All Recent Texts")
router.get('/recent', getRecentMessages);

// Thread for a specific (user, client)
router.get('/thread/:userId/:clientId', getThread);

// Send outbound message (masked) via Twilio
router.post('/send', sendMessage);

export default router;

