import express from 'express';
import { body } from 'express-validator';
import { authenticate, requireAgencyAdmin, requireAgencyAccess, requireBackofficeAdmin } from '../middleware/auth.middleware.js';
import { linkAgencySchool, listAgencySchools, listSchoolOrganizations, unlinkAgencySchool } from '../controllers/agencySchools.controller.js';

const router = express.Router();

// List available school organizations (for linking UI)
router.get('/schools', authenticate, requireBackofficeAdmin, listSchoolOrganizations);

// Manage agency↔school links
router.get('/:agencyId/schools', authenticate, requireAgencyAccess, listAgencySchools);

router.post(
  '/:agencyId/schools',
  authenticate,
  requireAgencyAdmin,
  [
    body('schoolOrganizationId').notEmpty().isInt({ min: 1 }).withMessage('schoolOrganizationId must be a positive integer'),
    body('isActive').optional().isBoolean().withMessage('isActive must be boolean')
  ],
  linkAgencySchool
);

router.delete('/:agencyId/schools/:schoolOrganizationId', authenticate, requireAgencyAdmin, unlinkAgencySchool);

export default router;

