import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getCallsAnalytics,
  getCallsFeed,
  getCommunicationsFeed,
  getSystemTestEmailPreflight,
  sendSystemTestEmail
} from '../controllers/communications.controller.js';
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

