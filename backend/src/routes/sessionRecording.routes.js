import express from 'express';
import { body, param, query } from 'express-validator';

import { authenticate, requireActiveStatus } from '../middleware/auth.middleware.js';
import { apiLimiter } from '../middleware/rateLimiter.middleware.js';

import {
  getSessionRecordingContext,
  listClientsForRecording,
  createRecording,
  getRecording,
  listRecordings,
  patchRecording,
  appendTranscript,
  startRecording,
  transcribeRecordingAudio,
  endAndSummarizeRecording,
  checkConsentOnFile,
  matchClientByNameDob,
  createConsentSigning,
  finalizeConsent,
  sessionRecordingUpload
} from '../controllers/sessionRecording.controller.js';

const router = express.Router();

router.use(authenticate, requireActiveStatus);

router.get(
  '/context',
  apiLimiter,
  [query('agencyId').isInt({ min: 1 })],
  getSessionRecordingContext
);

router.get(
  '/clients',
  apiLimiter,
  [query('agencyId').isInt({ min: 1 }), query('q').optional().isString().isLength({ max: 120 })],
  listClientsForRecording
);

router.get(
  '/consent/on-file',
  apiLimiter,
  [
    query('agencyId').isInt({ min: 1 }),
    query('clientId').optional().isInt({ min: 1 }),
    query('fullName').optional().isString().isLength({ max: 255 }),
    query('dateOfBirth').optional().isString().isLength({ max: 32 })
  ],
  checkConsentOnFile
);

router.post(
  '/consent/match',
  apiLimiter,
  [
    body('agencyId').isInt({ min: 1 }),
    body('fullName').isString().isLength({ min: 1, max: 255 }),
    body('dateOfBirth').isString().isLength({ min: 8, max: 32 })
  ],
  matchClientByNameDob
);

router.post(
  '/consent',
  apiLimiter,
  [
    body('agencyId').isInt({ min: 1 }),
    body('templateId').isInt({ min: 1 }),
    body('fullName').isString().isLength({ min: 1, max: 255 }),
    body('dateOfBirth').isString().isLength({ min: 8, max: 32 }),
    body('clientId').optional({ nullable: true }).isInt({ min: 1 }),
    body('sessionRecordingId').optional({ nullable: true }).isInt({ min: 1 })
  ],
  createConsentSigning
);

router.post(
  '/consent/:consentId/finalize',
  apiLimiter,
  [param('consentId').isInt({ min: 1 }), body('agencyId').isInt({ min: 1 })],
  finalizeConsent
);

router.get(
  '/',
  apiLimiter,
  [query('agencyId').isInt({ min: 1 }), query('limit').optional().isInt({ min: 1, max: 100 })],
  listRecordings
);

router.post(
  '/',
  apiLimiter,
  [
    body('agencyId').isInt({ min: 1 }),
    body('sessionKind').optional().isIn(['tutoring', 'clinical', 'standalone']),
    body('clientId').optional({ nullable: true }).isInt({ min: 1 }),
    body('officeEventId').optional({ nullable: true }).isInt({ min: 1 }),
    body('learningClassSessionId').optional({ nullable: true }).isInt({ min: 1 }),
    body('serviceCode').optional({ nullable: true }).isString().isLength({ max: 32 }),
    body('noteAidId').optional({ nullable: true }).isString().isLength({ max: 80 })
  ],
  createRecording
);

router.get(
  '/:id',
  apiLimiter,
  [param('id').isInt({ min: 1 }), query('agencyId').isInt({ min: 1 })],
  getRecording
);

router.patch(
  '/:id',
  apiLimiter,
  [param('id').isInt({ min: 1 }), body('agencyId').isInt({ min: 1 })],
  patchRecording
);

router.post(
  '/:id/start',
  apiLimiter,
  [param('id').isInt({ min: 1 }), body('agencyId').isInt({ min: 1 })],
  startRecording
);

router.post(
  '/:id/transcript',
  apiLimiter,
  [
    param('id').isInt({ min: 1 }),
    body('agencyId').isInt({ min: 1 }),
    body('chunk').isString().isLength({ min: 1, max: 8000 }),
    body('speakerLabel').optional().isString().isLength({ max: 80 })
  ],
  appendTranscript
);

router.post(
  '/:id/transcribe',
  apiLimiter,
  sessionRecordingUpload.single('audio'),
  [param('id').isInt({ min: 1 }), body('agencyId').isInt({ min: 1 })],
  transcribeRecordingAudio
);

router.post(
  '/:id/end',
  apiLimiter,
  sessionRecordingUpload.single('audio'),
  [param('id').isInt({ min: 1 }), body('agencyId').isInt({ min: 1 })],
  endAndSummarizeRecording
);

export default router;
