import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getPublicConfig,
  submitQuick,
  submitSupportInquiry,
  listProviders,
  updateJoinLanding,
  createPublicCoGuardianInvite,
  getPublicCoGuardianInvite,
  acceptPublicCoGuardianInvite,
  submitCoGuardianQuick,
  emailPublicPortalLogin,
  getConvertPrefill
} from '../controllers/adaptiveIntake.controller.js';
import { downloadQuickIntakeSummaryPdf, emailQuickIntakeSummaryPdf } from '../controllers/intakeSummaryPdf.controller.js';

const router = express.Router();

router.get('/convert-prefill', getConvertPrefill);
router.get('/co-guardian/:token', getPublicCoGuardianInvite);
router.post('/co-guardian/:token/accept', acceptPublicCoGuardianInvite);
router.post('/co-guardian/:token/quick', submitCoGuardianQuick);
router.get('/:agencySlug', getPublicConfig);
router.get('/:agencySlug/providers', listProviders);
router.post('/:agencySlug/quick', submitQuick);
router.post('/:agencySlug/summary-pdf', downloadQuickIntakeSummaryPdf);
router.post('/:agencySlug/summary-pdf/email', emailQuickIntakeSummaryPdf);
router.post('/:agencySlug/support-inquiry', submitSupportInquiry);
router.post('/:agencySlug/co-guardian-invite', createPublicCoGuardianInvite);
router.post('/:agencySlug/portal-login-email', emailPublicPortalLogin);
router.patch('/:agencySlug/landing', authenticate, updateJoinLanding);

export default router;
