import express from 'express';
import { body } from 'express-validator';
import { handleReferralScanResult, scanReferralNow } from '../controllers/referralScan.controller.js';

const router = express.Router();

router.post(
  '/scan-result',
  [
    body('storagePath').notEmpty().withMessage('storagePath is required'),
    body('scanStatus').isIn(['clean', 'infected', 'error']).withMessage('scanStatus must be clean, infected, or error'),
    body('scanResult').optional().isString()
  ],
  handleReferralScanResult
);

router.post(
  '/scan-now',
  [body('storagePath').notEmpty().withMessage('storagePath is required')],
  scanReferralNow
);

export default router;
