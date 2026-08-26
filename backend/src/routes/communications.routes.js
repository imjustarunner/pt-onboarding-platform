import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getCallsAnalytics,
  getCallsFeed,
  getCommunicationsFeed,
  getSystemTestEmailPreflight,
  sendSystemTestEmail
} from '../controllers/communications.controller.js';
import { getCommunicationsCenterSummary } from '../controllers/messagesDashboard.controller.js';
import {
  getUnifiedInboxes,
  getUnifiedAttentionSummary,
  getUnifiedConversations,
  getUnifiedConversation,
  patchUnifiedConversation,
  postUnifiedReply,
  postUnifiedCompose,
  postEnsurePersonalInbox,
  getUnifiedPrefs,
  patchUnifiedPrefs,
  getUnifiedDirectory,
  postSendPreflight
} from '../controllers/unifiedInbox.controller.js';
import {
  getCallSettings,
  getTransferTargets,
  holdCall,
  holdCallResume,
  listVoicemails,
  startConferenceCall,
  startOutboundCall,
  streamCallRecording,
  streamVoicemailAudio,
  transferCall,
  updateCallSettings
} from '../controllers/calls.controller.js';

const router = express.Router();
router.use(authenticate);

router.get('/feed', getCommunicationsFeed);
router.get('/center-summary', getCommunicationsCenterSummary);

// Unified Communications Inbox (Phase 1 + 2)
router.get('/inboxes', getUnifiedInboxes);
router.post('/inboxes/personal/ensure', postEnsurePersonalInbox);
router.get('/attention-summary', getUnifiedAttentionSummary);
router.get('/prefs', getUnifiedPrefs);
router.patch('/prefs', patchUnifiedPrefs);
router.get('/directory', getUnifiedDirectory);
router.post('/send-preflight', postSendPreflight);
router.get('/conversations', getUnifiedConversations);
router.post('/conversations', postUnifiedCompose);
router.get('/conversations/:id', getUnifiedConversation);
router.patch('/conversations/:id', patchUnifiedConversation);
router.post('/conversations/:id/reply', postUnifiedReply);
router.post('/test-email', sendSystemTestEmail);
router.post('/test-email/preflight', getSystemTestEmailPreflight);
router.get('/calls', getCallsFeed);
router.get('/calls/analytics', getCallsAnalytics);
router.get('/calls/settings', getCallSettings);
router.put('/calls/settings', updateCallSettings);
router.post('/calls/start', startOutboundCall);
router.post('/calls/start-conference', startConferenceCall);
router.get('/calls/transfer-targets', getTransferTargets);
router.post('/calls/transfer/:callSid', transferCall);
router.post('/calls/hold/:callSid', holdCall);
router.post('/calls/hold/:callSid/resume', holdCallResume);
router.get('/calls/voicemails', listVoicemails);
router.get('/calls/voicemails/:voicemailId/audio', streamVoicemailAudio);
router.get('/calls/:callLogId/recording', streamCallRecording);

export default router;

