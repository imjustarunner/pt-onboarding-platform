import express from 'express';
import { inboundSmsWebhook } from '../controllers/twilioWebhook.controller.js';
import {
  inboundVoiceWebhook,
  outboundBridgeWebhook,
  voiceDialCompleteWebhook,
  voiceVoicemailCompleteWebhook,
  voiceSupportNoticeWebhook,
  voiceStatusWebhook
} from '../controllers/twilioVoice.controller.js';
import TwilioService from '../services/twilio.service.js';

const router = express.Router();

// Optional signature validation (recommended in production)
// Enable by setting TWILIO_VALIDATE_SIGNATURE=true and providing TWILIO_AUTH_TOKEN.
const withOptionalSignatureValidation = (handler) => (req, res, next) => {
  try {
    const shouldValidate = String(process.env.TWILIO_VALIDATE_SIGNATURE || '').toLowerCase() === 'true';
    if (!shouldValidate) return handler(req, res, next);

    const signature = req.header('x-twilio-signature');
    if (!signature) {
      return res.status(403).send('Missing Twilio signature');
    }

    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const ok = TwilioService.validateWebhook({ url, params: req.body || {}, signature });
    if (!ok) {
      return res.status(403).send('Invalid Twilio signature');
    }

    return handler(req, res, next);
  } catch (e) {
    next(e);
  }
};

router.post('/webhook', withOptionalSignatureValidation(inboundSmsWebhook));
router.post('/voice/inbound', withOptionalSignatureValidation(inboundVoiceWebhook));
router.post('/voice/outbound-bridge', withOptionalSignatureValidation(outboundBridgeWebhook));
router.post('/voice/status', withOptionalSignatureValidation(voiceStatusWebhook));
router.post('/voice/dial-complete', withOptionalSignatureValidation(voiceDialCompleteWebhook));
router.post('/voice/support-notice', withOptionalSignatureValidation(voiceSupportNoticeWebhook));
router.post('/voice/voicemail-complete', withOptionalSignatureValidation(voiceVoicemailCompleteWebhook));

export default router;

