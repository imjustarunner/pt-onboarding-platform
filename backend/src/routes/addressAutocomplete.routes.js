import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireActiveStatus } from '../middleware/auth.middleware.js';
import { getClientIpAddress } from '../utils/ipAddress.util.js';
import { addressAutocompleteHandlers } from '../controllers/addressAutocomplete.controller.js';
const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false,
  keyGenerator: req => `address:${req.user?.id || getClientIpAddress(req) || req.ip}`,
  message: { error: { code: 'ADDRESS_LOOKUP_LIMIT', message: 'Enter the address manually or try suggestions later.' } } });
// Separate from enrollment save/submission limits: typing never consumes an intake submission.
router.post('/intake/:publicKey/suggest', limiter, addressAutocompleteHandlers.suggest);
router.post('/intake/:publicKey/select', limiter, addressAutocompleteHandlers.select);
router.post('/context/suggest', limiter, addressAutocompleteHandlers.contextSuggest);
router.post('/context/select', limiter, addressAutocompleteHandlers.contextSelect);
router.post('/suggest', authenticate, requireActiveStatus, limiter, addressAutocompleteHandlers.suggest);
router.post('/select', authenticate, requireActiveStatus, limiter, addressAutocompleteHandlers.select);
export default router;
