import express from 'express';
import {
  inboundVoiceWebhook,
  voiceExtensionInputWebhook,
  outboundBridgeWebhook,
  voiceConferenceJoinWebhook,
  voiceDialCompleteWebhook,
  voiceRecordingStatusWebhook,
  voiceResumeWebhook,
  voiceTransferDialWebhook,
  voiceVoicemailCompleteWebhook,
  voiceTranscriptionWebhook,
  voiceSupportNoticeWebhook,
  voiceStatusWebhook
} from '../controllers/voice.controller.js';
import { videoRoomStatusWebhook, videoCompositionStatusWebhook } from '../controllers/videoWebhook.controller.js';

const router = express.Router();

// Voice — Vonage NCCO handlers
router.get('/voice/answer', inboundVoiceWebhook);
router.post('/voice/answer', inboundVoiceWebhook);
router.post('/voice/event', voiceStatusWebhook);
router.post('/voice/extension-input', voiceExtensionInputWebhook);
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
router.post('/voice/transcription', voiceTranscriptionWebhook);

// Video — provider not configured; webhooks accept and discard
router.post('/video/webhook', videoRoomStatusWebhook);
router.post('/video/composition-status', videoCompositionStatusWebhook);

export default router;
