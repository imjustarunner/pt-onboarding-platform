import express from 'express';
import { body } from 'express-validator';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';
import { createIntakeLink, duplicateIntakeLink, listIntakeLinks, updateIntakeLink } from '../controllers/intakeLinks.controller.js';

const router = express.Router();

router.use(authenticate, requireBackofficeAdmin);

router.get('/', listIntakeLinks);

router.post(
  '/',
  [
    body('title').optional().isString(),
    body('description').optional().isString(),
    body('languageCode').optional().isString(),
    body('scopeType').isIn(['agency', 'school', 'program']).withMessage('scopeType must be agency, school, or program'),
    body('organizationId').optional().isInt(),
    body('programId').optional().isInt(),
    body('isActive').optional().isBoolean(),
    body('createClient').optional().isBoolean(),
    body('createGuardian').optional().isBoolean(),
    body('retentionPolicy').optional().custom((val) => typeof val === 'object' || typeof val === 'string')
  ],
  createIntakeLink
);

router.put(
  '/:id',
  [
    body('title').optional().isString(),
    body('description').optional().isString(),
    body('languageCode').optional().isString(),
    body('scopeType').optional().isIn(['agency', 'school', 'program']),
    body('organizationId').optional().isInt(),
    body('programId').optional().isInt(),
    body('isActive').optional().isBoolean(),
    body('createClient').optional().isBoolean(),
    body('createGuardian').optional().isBoolean(),
    body('retentionPolicy').optional().custom((val) => typeof val === 'object' || typeof val === 'string')
  ],
  updateIntakeLink
);

router.post('/:id/duplicate', duplicateIntakeLink);

export default router;
