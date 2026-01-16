import express from 'express';
import { body } from 'express-validator';
import {
  getDocumentTask,
  viewSignedDocument,
  giveConsent,
  recordIntent,
  signDocument,
  downloadSignedDocument,
  verifyDocument,
  finalizeI9Acroform
} from '../controllers/documentSigning.controller.js';
import { authenticate, requireCapability } from '../middleware/auth.middleware.js';

const router = express.Router();

const validateSignature = [
  body('signatureData').notEmpty().withMessage('Signature data is required')
];

const validateI9Finalize = [
  body('wizardData').notEmpty().withMessage('wizardData is required'),
  body('signatureData').notEmpty().withMessage('Signature data is required')
];

// All routes require authentication + document capability
router.use(authenticate, requireCapability('canSignDocuments'));

router.get('/:taskId', getDocumentTask);
router.get('/:taskId/view', viewSignedDocument); // View signed document in browser
router.post('/:taskId/consent', giveConsent);
router.post('/:taskId/intent', recordIntent);
router.post('/:taskId/sign', validateSignature, signDocument);
router.post('/:taskId/acroform/i9/finalize', validateI9Finalize, finalizeI9Acroform);
router.get('/:taskId/download', downloadSignedDocument);
router.get('/:taskId/verify', verifyDocument);

export default router;

