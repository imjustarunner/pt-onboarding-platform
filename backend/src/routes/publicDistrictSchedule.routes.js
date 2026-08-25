import express from 'express';
import {
  getPublicDistrictScheduleDirectory,
  getPublicDistrictScheduleView
} from '../controllers/publicDistrictSchedule.controller.js';
import { publicSchoolReferralDirectoryLimiter } from '../middleware/rateLimiter.middleware.js';
import { authenticateOptional } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get(
  '/:agencySlug',
  publicSchoolReferralDirectoryLimiter,
  authenticateOptional,
  getPublicDistrictScheduleDirectory
);

router.get(
  '/:agencySlug/:districtSlug',
  publicSchoolReferralDirectoryLimiter,
  authenticateOptional,
  getPublicDistrictScheduleView
);

export default router;
