import express from 'express';
import {
  getPublicAgencySupport,
  postPublicAgencySupportTicket,
  patchPublicAgencySupportSettings
} from '../controllers/publicAgencySupport.controller.js';
import { publicAgencySupportTicketLimiter } from '../middleware/rateLimiter.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/:agencySlug', getPublicAgencySupport);
router.patch('/:agencySlug/settings', authenticate, patchPublicAgencySupportSettings);
router.post('/:agencySlug/tickets', publicAgencySupportTicketLimiter, postPublicAgencySupportTicket);

export default router;
