import express from 'express';
import { body } from 'express-validator';
import {
  getDocumentTask,
  viewSignedDocument,
  giveConsent,
  recordIntent,
  signDocument,
  downloadSignedDocument,
  verifyDocument
} from '../controllers/documentSigning.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

const validateSignature = [
  body('signatureData').notEmpty().withMessage('Signature data is required')
];

// All routes require authentication
router.get('/:taskId', authenticate, getDocumentTask);
router.get('/:taskId/view', authenticate, viewSignedDocument); // View signed document in browser
router.post('/:taskId/consent', authenticate, giveConsent);
router.post('/:taskId/intent', authenticate, recordIntent);
router.post('/:taskId/sign', authenticate, validateSignature, signDocument);
router.get('/:taskId/download', authenticate, downloadSignedDocument);
router.get('/:taskId/verify', authenticate, verifyDocument);

export default router;

