import express from 'express';
import multer from 'multer';
import { body, param, query } from 'express-validator';

import { authenticate, requireActiveStatus } from '../middleware/auth.middleware.js';
import { apiLimiter } from '../middleware/rateLimiter.middleware.js';

import {
  getClinicalNotesContext,
  listClinicalNotePrograms,
  createClinicalNoteDraft,
  patchClinicalNoteDraft,
  listRecentClinicalNoteDrafts,
  generateClinicalNote
} from '../controllers/clinicalNoteGenerator.controller.js';

const router = express.Router();

// Logged-in tool; also block archived/expired users.
router.use(authenticate, requireActiveStatus);

// File upload (audio). Store in memory; forward to ADK as base64.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024 // 25MB
  }
});

router.get('/context', apiLimiter, [query('agencyId').isInt({ min: 1 })], getClinicalNotesContext);

router.get('/programs', apiLimiter, [query('agencyId').isInt({ min: 1 })], listClinicalNotePrograms);

router.get(
  '/recent',
  apiLimiter,
  [query('agencyId').isInt({ min: 1 }), query('days').optional().isInt({ min: 1, max: 30 })],
  listRecentClinicalNoteDrafts
);

router.post(
  '/drafts',
  apiLimiter,
  [
    body('agencyId').isInt({ min: 1 }),
    body('serviceCode').optional().isString().isLength({ min: 1, max: 32 }),
    body('programId').optional().isInt({ min: 1 }),
    body('dateOfService').optional().isString().isLength({ min: 1, max: 32 }),
    body('initials').optional().isString().isLength({ min: 1, max: 16 }),
    body('inputText').optional().isString().isLength({ min: 0, max: 12000 })
  ],
  createClinicalNoteDraft
);

router.patch(
  '/drafts/:draftId',
  apiLimiter,
  [
    param('draftId').isInt({ min: 1 }),
    body('agencyId').isInt({ min: 1 }),
    body('serviceCode').optional({ nullable: true }).isString().isLength({ min: 1, max: 32 }),
    body('programId').optional({ nullable: true }).isInt({ min: 1 }),
    body('dateOfService').optional({ nullable: true }).isString().isLength({ min: 1, max: 32 }),
    body('initials').optional({ nullable: true }).isString().isLength({ min: 0, max: 16 }),
    body('inputText').optional({ nullable: true }).isString().isLength({ min: 0, max: 12000 })
  ],
  patchClinicalNoteDraft
);

router.post(
  '/generate',
  apiLimiter,
  upload.single('audio'),
  [
    body('agencyId').isInt({ min: 1 }),
    body('serviceCode').isString().isLength({ min: 1, max: 32 }),
    body('programId').optional().isInt({ min: 1 }),
    body('dateOfService').optional().isString().isLength({ min: 1, max: 32 }),
    body('initials').optional().isString().isLength({ min: 0, max: 16 }),
    body('inputText').isString().isLength({ min: 1, max: 12000 }),
    body('draftId').optional().isInt({ min: 1 })
  ],
  generateClinicalNote
);

export default router;

