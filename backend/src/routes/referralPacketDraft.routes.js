import express from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  clearReferralOcrResult,
  listReferralOcrRequests,
  processReferralOcrRequest,
  requestReferralOcr,
  setReferralProfileInitials
} from '../controllers/referralOcr.controller.js';

const router = express.Router();

router.get('/:draftId/ocr', authenticate, listReferralOcrRequests);

router.post(
  '/:draftId/ocr',
  authenticate,
  [body('phiDocumentId').optional().isInt().withMessage('phiDocumentId must be an integer')],
  requestReferralOcr
);

router.post('/:draftId/ocr/:requestId/process', authenticate, processReferralOcrRequest);
router.post(
  '/:draftId/ocr/:requestId/identify',
  authenticate,
  [
    body('firstName').notEmpty().withMessage('firstName is required'),
    body('lastName').notEmpty().withMessage('lastName is required')
  ],
  setReferralProfileInitials
);

router.post('/:draftId/ocr/:requestId/clear', authenticate, clearReferralOcrResult);

export default router;
