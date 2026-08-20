import express from 'express';
import {
  getPublicDistrictScheduleDirectory,
  getPublicDistrictScheduleView
} from '../controllers/publicDistrictSchedule.controller.js';
import { publicSchoolReferralDirectoryLimiter } from '../middleware/rateLimiter.middleware.js';

const router = express.Router();

router.get(
  '/:agencySlug',
  publicSchoolReferralDirectoryLimiter,
  getPublicDistrictScheduleDirectory
);

router.get(
  '/:agencySlug/:districtSlug',
  publicSchoolReferralDirectoryLimiter,
  getPublicDistrictScheduleView
);

export default router;
