import express from 'express';
import { inboundSmsWebhook, deliveryStatusWebhook } from '../controllers/vonageWebhook.controller.js';
import VonageService from '../services/vonage.service.js';

const router = express.Router();

// Signed SMS API webhooks are mandatory in production. Ask Vonage to enable
// inbound and delivery receipt signing before deployment. Local tests may opt in.
const withOptionalSignatureValidation = (handler) => (req, res, next) => {
  try {
    const shouldValidate = process.env.NODE_ENV === 'production'
      || String(process.env.VONAGE_VALIDATE_SIGNATURE || '').toLowerCase() === 'true';
    if (!shouldValidate) return handler(req, res, next);

    const signature = req.body?.sig || req.query?.sig || '';
    if (!signature) {
      return res.status(403).json({ error: 'Missing Vonage signature' });
    }

    // Vonage sends sig in the body/query; validate against all other params.
    const params = { ...(req.query || {}), ...(req.body || {}) };
    delete params.sig;
    const ok = VonageService.validateWebhook({ params, signature });
    if (!ok) {
      return res.status(403).json({ error: 'Invalid Vonage signature' });
    }

    return handler(req, res, next);
  } catch (e) {
    next(e);
  }
};

// Vonage inbound SMS webhook — set this URL in your Vonage dashboard under
// "SMS Settings" > "Inbound messages webhook" or per-number moHttpUrl.
router.post('/inbound', withOptionalSignatureValidation(inboundSmsWebhook));
router.get('/inbound', withOptionalSignatureValidation(inboundSmsWebhook));

// Vonage delivery status webhook — set this URL in your Vonage dashboard under
// "SMS Settings" > "Delivery receipts webhook".
router.post('/status', withOptionalSignatureValidation(deliveryStatusWebhook));
router.get('/status', withOptionalSignatureValidation(deliveryStatusWebhook));

export default router;
