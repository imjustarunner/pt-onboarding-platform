import express from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listAgencyProvidersCredentialing,
  patchAgencyProvidersCredentialing,
  downloadAgencyProvidersCredentialingCsv,
  deleteAgencyProvidersCredentialingField
} from '../controllers/agencyCredentialing.controller.js';

const router = express.Router();

const validatePatch = [
  body('updates').isArray().withMessage('updates must be an array'),
  body('updates.*.userId').isInt({ min: 1 }).withMessage('userId must be an integer'),
  body('updates.*.fieldKey').isString().trim().notEmpty().withMessage('fieldKey required'),
  body('updates.*.value').optional({ nullable: true })
];

router.get('/:agencyId/credentialing/providers', authenticate, listAgencyProvidersCredentialing);
router.patch('/:agencyId/credentialing/providers', authenticate, validatePatch, patchAgencyProvidersCredentialing);
router.get('/:agencyId/credentialing/providers.csv', authenticate, downloadAgencyProvidersCredentialingCsv);

// Optional cleanup endpoint (purge stored values by field_key across providers in an agency)
router.delete('/:agencyId/credentialing/field/:fieldKey', authenticate, deleteAgencyProvidersCredentialingField);

export default router;

