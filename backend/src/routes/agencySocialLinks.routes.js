import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getAgencySocialLinksAdmin,
  getAgencySocialLinksPublic,
  putAgencySocialLinksAdmin,
  upsertAgencySocialLinkAdmin,
  deleteAgencySocialLinkAdmin,
  putAgencySignatureTaglineAdmin
} from '../controllers/agencySocialLinks.controller.js';

const router = express.Router({ mergeParams: true });

router.get('/:agencyId/social-links/public', getAgencySocialLinksPublic);

router.get('/:agencyId/social-links', authenticate, getAgencySocialLinksAdmin);
router.put('/:agencyId/social-links', authenticate, putAgencySocialLinksAdmin);
router.post('/:agencyId/social-links', authenticate, upsertAgencySocialLinkAdmin);
router.delete('/:agencyId/social-links/:linkId', authenticate, deleteAgencySocialLinkAdmin);
router.put('/:agencyId/signature-tagline', authenticate, putAgencySignatureTaglineAdmin);

export default router;
