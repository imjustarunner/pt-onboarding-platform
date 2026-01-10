import express from 'express';
import {
  generateCertificate,
  getUserCertificates,
  getCertificate,
  downloadCertificate
} from '../controllers/certificate.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { body } from 'express-validator';

const router = express.Router();

router.use(authenticate);

router.get('/', getUserCertificates);
router.get('/:id', getCertificate);
router.get('/:id/download', downloadCertificate);

router.post(
  '/generate',
  [
    body('certificateType').isIn(['training_focus', 'module']).withMessage('Invalid certificate type'),
    body('referenceId').isInt().withMessage('Reference ID is required')
  ],
  generateCertificate
);

export default router;

