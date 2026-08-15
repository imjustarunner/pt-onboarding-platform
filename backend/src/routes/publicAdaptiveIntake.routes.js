import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getPublicConfig,
  submitQuick,
  submitSupportInquiry,
  listProviders,
  updateJoinLanding
} from '../controllers/adaptiveIntake.controller.js';
import { downloadQuickIntakeSummaryPdf } from '../controllers/intakeSummaryPdf.controller.js';

const router = express.Router();

router.get('/:agencySlug', getPublicConfig);
router.get('/:agencySlug/providers', listProviders);
router.post('/:agencySlug/quick', submitQuick);
router.post('/:agencySlug/summary-pdf', downloadQuickIntakeSummaryPdf);
router.post('/:agencySlug/support-inquiry', submitSupportInquiry);
router.patch('/:agencySlug/landing', authenticate, updateJoinLanding);

export default router;
