import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { getCallsAnalytics, getCallsFeed, getCommunicationsFeed } from '../controllers/communications.controller.js';
import {
  getCallSettings,
  listVoicemails,
  startOutboundCall,
  streamVoicemailAudio,
  updateCallSettings
} from '../controllers/calls.controller.js';

const router = express.Router();
router.use(authenticate);

router.get('/feed', getCommunicationsFeed);
router.get('/calls', getCallsFeed);
router.get('/calls/analytics', getCallsAnalytics);
router.get('/calls/settings', getCallSettings);
router.put('/calls/settings', updateCallSettings);
router.post('/calls/start', startOutboundCall);
router.get('/calls/voicemails', listVoicemails);
router.get('/calls/voicemails/:voicemailId/audio', streamVoicemailAudio);

export default router;

