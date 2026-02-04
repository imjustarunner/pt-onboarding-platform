import express from 'express';
import { body } from 'express-validator';
import {
  createPublicConsent,
  getPublicIntakeLink,
  getSchoolIntakeLink,
  submitPublicIntake
} from '../controllers/publicIntake.controller.js';

const router = express.Router();

router.get('/school/:organizationId', getSchoolIntakeLink);
router.get('/:publicKey', getPublicIntakeLink);

router.post(
  '/:publicKey/consent',
  [
    body('signerName').notEmpty().withMessage('signerName is required'),
    body('signerInitials').notEmpty().withMessage('signerInitials is required'),
    body('signerEmail').optional().isString(),
    body('signerPhone').optional().isString()
  ],
  createPublicConsent
);

router.post(
  '/:publicKey/submit',
  [
    body('submissionId').isInt().withMessage('submissionId is required'),
    body('signatureData').notEmpty().withMessage('signatureData is required')
  ],
  submitPublicIntake
);

export default router;
