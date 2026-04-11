import express from 'express';
import { inboundSmsWebhook, deliveryStatusWebhook } from '../controllers/vonageWebhook.controller.js';
import VonageService from '../services/vonage.service.js';

const router = express.Router();

// Optional Vonage webhook signature validation.
// Enable by setting VONAGE_VALIDATE_SIGNATURE=true and VONAGE_SIGNATURE_SECRET.
const withOptionalSignatureValidation = (handler) => (req, res, next) => {
  try {
    const shouldValidate = String(process.env.VONAGE_VALIDATE_SIGNATURE || '').toLowerCase() === 'true';
    if (!shouldValidate) return handler(req, res, next);

    const signature = req.body?.sig || req.query?.sig || '';
    if (!signature) {
      return res.status(403).json({ error: 'Missing Vonage signature' });
    }

    // Vonage sends sig in the body/query; validate against all other params.
    const params = { ...req.body };
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
router.post('/status', deliveryStatusWebhook);
router.get('/status', deliveryStatusWebhook);

export default router;
