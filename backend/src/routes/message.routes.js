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
  getRtcToken,
  getCareThread,
  updateCareThread
} from '../controllers/message.controller.js';
import { getMessagesDashboardSummary } from '../controllers/messagesDashboard.controller.js';
import {
  searchMessagesHubPeople,
  getMessagesHubPerson,
  getMessagesHubTimeline,
  postMessagesHubSend,
  getMessagesHubAliases,
  postMessagesHubReact
} from '../controllers/messagesHub.controller.js';

const router = express.Router();

router.use(authenticate);

// Employee Messages Dashboard summary (personal unread / priority)
router.get('/dashboard-summary', getMessagesDashboardSummary);

// People-first Messaging Hub
router.get('/hub/people', searchMessagesHubPeople);
router.get('/hub/people/:personKey', getMessagesHubPerson);
router.get('/hub/people/:personKey/timeline', getMessagesHubTimeline);
router.get('/hub/aliases', getMessagesHubAliases);
router.post('/hub/send', postMessagesHubSend);
router.post('/hub/react', postMessagesHubReact);

// Grouped conversation threads (one row per client, last message + unread count)
router.get('/threads', getThreads);

// Clinical SMS care ownership / support observe|claim
router.get('/care-thread', getCareThread);
router.patch('/care-thread', updateCareThread);

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

