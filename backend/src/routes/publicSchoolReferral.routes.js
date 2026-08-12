import express from 'express';
import {
  getPublicSchoolReferralDirectory,
  createPublicSchoolReferralTicket
} from '../controllers/publicSchoolReferral.controller.js';
import {
  publicSchoolReferralDirectoryLimiter,
  publicSchoolReferralTicketLimiter
} from '../middleware/rateLimiter.middleware.js';

const router = express.Router();

router.get(
  '/:agencySlug',
  publicSchoolReferralDirectoryLimiter,
  getPublicSchoolReferralDirectory
);

router.post(
  '/:agencySlug/support-tickets',
  publicSchoolReferralTicketLimiter,
  createPublicSchoolReferralTicket
);

export default router;
