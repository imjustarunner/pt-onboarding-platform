import express from 'express';
import { inboundSmsWebhook } from '../controllers/twilioWebhook.controller.js';
import TwilioService from '../services/twilio.service.js';

const router = express.Router();

// Optional signature validation (recommended in production)
// Enable by setting TWILIO_VALIDATE_SIGNATURE=true and providing TWILIO_AUTH_TOKEN.
router.post('/webhook', (req, res, next) => {
  try {
    const shouldValidate = String(process.env.TWILIO_VALIDATE_SIGNATURE || '').toLowerCase() === 'true';
    if (!shouldValidate) return inboundSmsWebhook(req, res, next);

    const signature = req.header('x-twilio-signature');
    if (!signature) {
      return res.status(403).send('Missing Twilio signature');
    }

    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const ok = TwilioService.validateWebhook({ url, params: req.body || {}, signature });
    if (!ok) {
      return res.status(403).send('Invalid Twilio signature');
    }

    return inboundSmsWebhook(req, res, next);
  } catch (e) {
    next(e);
  }
});

export default router;

