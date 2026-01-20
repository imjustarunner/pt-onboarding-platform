import express from 'express';
import { uploadReferralPacket } from '../controllers/referralUpload.controller.js';
import { duplicateOrganization, getOrganizationAffiliation, applyAffiliatedAgencyBranding } from '../controllers/organization.controller.js';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';
import { body } from 'express-validator';

const router = express.Router();

// Public route - no authentication required
// POST /api/organizations/:slug/upload-referral
router.post('/:slug/upload-referral', uploadReferralPacket);

// Protected org management routes
// POST /api/organizations/:id/duplicate
router.post(
  '/:id/duplicate',
  authenticate,
  requireBackofficeAdmin,
  [
    body('name').trim().notEmpty().withMessage('name is required'),
    body('slug').trim().notEmpty().withMessage('slug is required').matches(/^[a-z0-9-]+$/).withMessage('slug must be lowercase alphanumeric with hyphens only'),
    body('portalUrl').optional({ nullable: true, checkFalsy: true }).matches(/^[a-z0-9-]+$/).withMessage('portalUrl must be lowercase alphanumeric with hyphens only')
  ],
  duplicateOrganization
);

// GET /api/organizations/:id/affiliation
router.get('/:id/affiliation', authenticate, requireBackofficeAdmin, getOrganizationAffiliation);

// POST /api/organizations/:id/apply-affiliated-agency-branding
router.post('/:id/apply-affiliated-agency-branding', authenticate, requireBackofficeAdmin, applyAffiliatedAgencyBranding);

export default router;
