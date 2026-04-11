import express from 'express';
import {
  inboundVoiceWebhook,
  outboundBridgeWebhook,
  voiceConferenceJoinWebhook,
  voiceDialCompleteWebhook,
  voiceRecordingStatusWebhook,
  voiceResumeWebhook,
  voiceTransferDialWebhook,
  voiceVoicemailCompleteWebhook,
  voiceSupportNoticeWebhook,
  voiceStatusWebhook
} from '../controllers/twilioVoice.controller.js';
import { videoRoomStatusWebhook, videoCompositionStatusWebhook } from '../controllers/twilioVideoWebhook.controller.js';

const router = express.Router();

// Voice — provider not configured; all webhooks respond with safe hangup
router.post('/voice/inbound', inboundVoiceWebhook);
router.post('/voice/outbound-bridge', outboundBridgeWebhook);
router.post('/voice/status', voiceStatusWebhook);
router.post('/voice/dial-complete', voiceDialCompleteWebhook);
router.post('/voice/recording-status', voiceRecordingStatusWebhook);
router.get('/voice/conference-join', voiceConferenceJoinWebhook);
router.get('/voice/resume', voiceResumeWebhook);
router.post('/voice/resume', voiceResumeWebhook);
router.get('/voice/transfer-dial', voiceTransferDialWebhook);
router.post('/voice/transfer-dial', voiceTransferDialWebhook);
router.post('/voice/support-notice', voiceSupportNoticeWebhook);
router.post('/voice/voicemail-complete', voiceVoicemailCompleteWebhook);

// Video — provider not configured; webhooks accept and discard
router.post('/video/webhook', videoRoomStatusWebhook);
router.post('/video/composition-status', videoCompositionStatusWebhook);

export default router;
