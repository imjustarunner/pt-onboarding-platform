import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getPublicConfig,
  submitQuick,
  submitSupportInquiry,
  listProviders,
  updateJoinLanding,
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
// Older clients must not create invitations from arbitrary public client IDs.
router.post('/:agencySlug/co-guardian-invite', (req,res) => res.status(410).json({ error: { message: 'Invitations are created with enrollment. Sign in to your portal to correct or resend one.' } }));
router.post('/:agencySlug/portal-login-email', emailPublicPortalLogin);
router.patch('/:agencySlug/landing', authenticate, updateJoinLanding);

export default router;
