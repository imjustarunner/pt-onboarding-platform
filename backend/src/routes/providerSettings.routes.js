import express from 'express';
import { body } from 'express-validator';
import { authenticate, requireAgencyAdmin } from '../middleware/auth.middleware.js';
import {
  listProviderCredentials,
  upsertProviderCredential,
  listCredentialInsuranceMatrix,
  setCredentialInsuranceEligibility
} from '../controllers/providerSettings.controller.js';

const router = express.Router();

router.get('/credentials', authenticate, requireAgencyAdmin, listProviderCredentials);
router.post(
  '/credentials',
  authenticate,
  requireAgencyAdmin,
  [
    body('credentialKey').isString().isLength({ min: 1, max: 64 }),
    body('label').isString().isLength({ min: 1, max: 255 }),
    body('isActive').optional()
  ],
  upsertProviderCredential
);
router.put(
  '/credentials/:id',
  authenticate,
  requireAgencyAdmin,
  [
    body('credentialKey').isString().isLength({ min: 1, max: 64 }),
    body('label').isString().isLength({ min: 1, max: 255 }),
    body('isActive').optional()
  ],
  (req, res, next) => {
    req.body.id = req.params.id;
    next();
  },
  upsertProviderCredential
);

router.get('/credential-insurance', authenticate, requireAgencyAdmin, listCredentialInsuranceMatrix);
router.post(
  '/credential-insurance',
  authenticate,
  requireAgencyAdmin,
  [
    body('credentialId').isInt({ min: 1 }),
    body('insuranceTypeId').isInt({ min: 1 }),
    body('isAllowed').optional()
  ],
  setCredentialInsuranceEligibility
);

export default router;

