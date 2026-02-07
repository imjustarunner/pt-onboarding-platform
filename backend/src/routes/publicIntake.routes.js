import express from 'express';
import { body } from 'express-validator';
import { publicIntakeLimiter } from '../middleware/rateLimiter.middleware.js';
import {
  approvePublicIntake,
  createPublicConsent,
  finalizePublicIntake,
  getPublicIntakeLink,
  getPublicIntakeStatus,
  getSchoolIntakeLink,
  previewPublicTemplate,
  signPublicIntakeDocument,
  submitPublicIntake
} from '../controllers/publicIntake.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(publicIntakeLimiter);

router.get('/school/:organizationId', getSchoolIntakeLink);
router.get('/:publicKey', getPublicIntakeLink);
router.get('/:publicKey/status/:submissionId', getPublicIntakeStatus);
router.get('/:publicKey/document/:templateId/preview', previewPublicTemplate);
router.post('/:publicKey/approve', authenticate, approvePublicIntake);

router.post(
  '/:publicKey/consent',
  [
    body('signerName').notEmpty().withMessage('signerName is required'),
    body('signerInitials').notEmpty().withMessage('signerInitials is required'),
    body('signerEmail').notEmpty().withMessage('signerEmail is required'),
    body('signerPhone').optional().isString(),
    body('captchaToken').optional().isString()
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

router.post(
  '/:publicKey/:submissionId/document/:templateId/sign',
  [
    body('signatureData').optional().isString(),
    body('fieldValues').optional()
  ],
  signPublicIntakeDocument
);

router.post(
  '/:publicKey/:submissionId/finalize',
  [
    body('submissionId').optional().isInt()
  ],
  finalizePublicIntake
);

export default router;
