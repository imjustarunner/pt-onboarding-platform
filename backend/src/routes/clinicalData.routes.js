import express from 'express';
import { body, param, query } from 'express-validator';
import { authenticate, requireActiveStatus } from '../middleware/auth.middleware.js';
import {
  bootstrapClinicalSession,
  listSessionArtifacts,
  createSessionNote,
  createSessionClaim,
  createSessionDocument,
  softDeleteClinicalRecord,
  restoreClinicalRecord,
  setClinicalRecordLegalHold,
  releaseClinicalRecordLegalHold
} from '../controllers/clinicalData.controller.js';

const router = express.Router();

router.use(authenticate, requireActiveStatus);

router.post(
  '/sessions/bootstrap',
  [
    body('agencyId').isInt({ min: 1 }),
    body('clientId').isInt({ min: 1 }),
    body('officeEventId').isInt({ min: 1 }),
    body('sourceTimezone').optional().isString().isLength({ min: 2, max: 64 })
  ],
  bootstrapClinicalSession
);

router.get(
  '/sessions/:sessionId/artifacts',
  [
    param('sessionId').isInt({ min: 1 }),
    query('includeDeleted').optional().isString()
  ],
  listSessionArtifacts
);

router.post(
  '/sessions/:sessionId/notes',
  [
    param('sessionId').isInt({ min: 1 }),
    body('title').isString().isLength({ min: 1, max: 255 }),
    body('notePayload').optional().isString()
  ],
  createSessionNote
);

router.post(
  '/sessions/:sessionId/claims',
  [
    param('sessionId').isInt({ min: 1 }),
    body('claimNumber').optional().isString().isLength({ min: 1, max: 120 }),
    body('claimStatus').optional().isString().isLength({ min: 1, max: 60 }),
    body('amountCents').optional().isInt({ min: 0 }),
    body('currencyCode').optional().isString().isLength({ min: 3, max: 8 }),
    body('claimPayload').optional().isString()
  ],
  createSessionClaim
);

router.post(
  '/sessions/:sessionId/documents',
  [
    param('sessionId').isInt({ min: 1 }),
    body('title').isString().isLength({ min: 1, max: 255 }),
    body('documentType').optional().isString().isLength({ min: 1, max: 120 }),
    body('storagePath').optional().isString().isLength({ min: 1, max: 700 }),
    body('originalName').optional().isString().isLength({ min: 1, max: 255 }),
    body('mimeType').optional().isString().isLength({ min: 1, max: 128 })
  ],
  createSessionDocument
);

router.delete(
  '/records/:recordType/:id',
  [
    param('recordType').isIn(['note', 'claim', 'document']),
    param('id').isInt({ min: 1 })
  ],
  softDeleteClinicalRecord
);

router.post(
  '/records/:recordType/:id/restore',
  [
    param('recordType').isIn(['note', 'claim', 'document']),
    param('id').isInt({ min: 1 })
  ],
  restoreClinicalRecord
);

router.post(
  '/records/:recordType/:id/legal-hold',
  [
    param('recordType').isIn(['note', 'claim', 'document']),
    param('id').isInt({ min: 1 }),
    body('reason').isString().isLength({ min: 1, max: 1000 })
  ],
  setClinicalRecordLegalHold
);

router.post(
  '/records/:recordType/:id/legal-hold/release',
  [
    param('recordType').isIn(['note', 'claim', 'document']),
    param('id').isInt({ min: 1 })
  ],
  releaseClinicalRecordLegalHold
);

export default router;

