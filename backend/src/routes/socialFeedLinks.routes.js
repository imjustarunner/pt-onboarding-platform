import express from 'express';
import { body } from 'express-validator';
import { authenticate, requireAgencyAdmin } from '../middleware/auth.middleware.js';
import {
  listByAgency,
  create,
  update,
  remove
} from '../controllers/socialFeedLinks.controller.js';

const router = express.Router();

router.get('/:agencyId/social-feeds', authenticate, requireAgencyAdmin, listByAgency);

router.post(
  '/:agencyId/social-feeds',
  authenticate,
  requireAgencyAdmin,
  [
    body('type').optional().isIn(['instagram', 'facebook', 'rss', 'link']),
    body('label').isString().trim().notEmpty().withMessage('label is required'),
    body('url').optional().isString(),
    body('externalUrl').optional().isString(),
    body('organizationId').optional().isInt(),
    body('programId').optional().isInt(),
    body('sortOrder').optional().isInt(),
    body('isActive').optional().isBoolean()
  ],
  create
);

router.put(
  '/:agencyId/social-feeds/:id',
  authenticate,
  requireAgencyAdmin,
  [
    body('type').optional().isIn(['instagram', 'facebook', 'rss', 'link']),
    body('label').optional().isString().trim(),
    body('url').optional().isString(),
    body('externalUrl').optional().isString(),
    body('organizationId').optional().isInt(),
    body('programId').optional().isInt(),
    body('sortOrder').optional().isInt(),
    body('isActive').optional().isBoolean()
  ],
  update
);

router.delete('/:agencyId/social-feeds/:id', authenticate, requireAgencyAdmin, remove);

export default router;
