import express from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.middleware.js';
import { listReferralOcrRequests, processReferralOcrRequest, requestReferralOcr, setReferralProfileInitials } from '../controllers/referralOcr.controller.js';

const router = express.Router();

router.get('/:clientId/ocr', authenticate, listReferralOcrRequests);

router.post(
  '/:clientId/ocr',
  authenticate,
  [body('phiDocumentId').optional().isInt().withMessage('phiDocumentId must be an integer')],
  requestReferralOcr
);

router.post('/:clientId/ocr/:requestId/process', authenticate, processReferralOcrRequest);
router.post(
  '/:clientId/ocr/:requestId/identify',
  authenticate,
  [
    body('firstName').notEmpty().withMessage('firstName is required'),
    body('lastName').notEmpty().withMessage('lastName is required')
  ],
  setReferralProfileInitials
);

export default router;
