import express from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.middleware.js';
import { listReferralOcrRequests, requestReferralOcr } from '../controllers/referralOcr.controller.js';

const router = express.Router();

router.get('/:clientId/ocr', authenticate, listReferralOcrRequests);

router.post(
  '/:clientId/ocr',
  authenticate,
  [body('phiDocumentId').optional().isInt().withMessage('phiDocumentId must be an integer')],
  requestReferralOcr
);

export default router;
