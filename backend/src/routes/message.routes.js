import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { 
  deleteMessageLog, 
  deleteThread, 
  forwardToSupport, 
  getMyNumbers, 
  getRecentMessages, 
  getThread, 
  getThreads, 
  sendMessage, 
  uploadSmsMedia,
  getSmartReplies,
  getRtcToken 
} from '../controllers/message.controller.js';

const router = express.Router();

router.use(authenticate);

// Grouped conversation threads (one row per client, last message + unread count)
router.get('/threads', getThreads);

// Numbers assigned to the authenticated user (for compose picker)
router.get('/my-numbers', getMyNumbers);

// Recent texts (scoped to authenticated user)
router.get('/recent', getRecentMessages);

// Thread for a specific (user, client)
router.get('/thread/:userId/:clientId', getThread);

// Upload MMS media (returns a signed storage URL)
router.post('/upload-media', uploadSmsMedia);

// Send outbound message (masked) via Vonage
router.post('/send', sendMessage);

// Manual forward thread to support
router.post('/forward-to-support', forwardToSupport);

// AI smart replies
router.get('/smart-replies', getSmartReplies);

// RTC token for typing indicators / real-time chat
router.get('/rtc-token', getRtcToken);

// Permanently delete an entire thread (all logs for this user+client)
router.delete('/thread/:clientId', deleteThread);

// Permanently delete a single message log (owned by user)
router.delete('/log/:id', deleteMessageLog);

export default router;

