import { clinicalSessionAudioUpload } from '../controllers/clinicalSessionRecording.controller.js';
import { requireClinicalChart } from '../middleware/medicalBilling.middleware.js';
import * as confidential from '../controllers/confidentialClinicalEntries.controller.js';
import { getClinicalAppointmentAlerts, acknowledgeClinicalAppointmentAlert } from '../controllers/clinicalAppointmentAlerts.controller.js';
import { downloadClinicalDraftPdf } from '../controllers/clinicalRecordExport.controller.js';
import * as contactDocumentation from '../controllers/contactDocumentation.controller.js';
import {searchDiagnosisCatalog} from '../controllers/clinicalDiagnosisSearch.controller.js';
import express from 'express';
import { excludeFamilyClinicalWorkspace, excludeSupportClinicalContent } from '../middleware/supportContentAccess.middleware.js';
import multer from 'multer';
import { body, param, query } from 'express-validator';

import { authenticate, requireActiveStatus } from '../middleware/auth.middleware.js';
import { apiLimiter, clinicalWorkspaceLimiter, noteAidLimiter } from '../middleware/rateLimiter.middleware.js';
import {
  getTherapyNotesQuickCopyCatalog, listTherapyNotesQuickCopyNotes, getTherapyNotesQuickCopyNote,
  updateTherapyNotesQuickCopyNote, transcribeTherapyNotesQuickCopy, generateTherapyNotesQuickCopy, getTherapyNotesQuickCopyServiceReference
} from '../controllers/therapyNotesQuickGenerator.controller.js';

import {
  getClinicalNotesContext,
  listClinicalNotePrograms,
  createConsentTask,
  createClinicalNoteDraft,
  patchClinicalNoteDraft,
  repairClinicalDraftAppointment,
  listRecentClinicalNoteDrafts,
  archiveClinicalNoteDraft,
  deleteClinicalNoteDrafts,
  transcribeClinicalNoteAudio,
  transcribeClinicianDictation,
  generateClinicalNote,
  generateInteractiveComplexitySentence,
  getTerminationOutcomeStats,
  recordNoteAidAudit
} from '../controllers/clinicalNoteGenerator.controller.js';
import {
  listNoteAidWorkQueue,
  syncNoteAidWorkQueue,
  appendNoteAidWorkQueue,
  patchNoteAidWorkQueueItem,
  deleteNoteAidWorkQueueItem,
  clearNoteAidWorkQueue
} from '../controllers/noteAidWorkQueue.controller.js';

const router = express.Router();

// Logged-in tool; also block archived/expired users.
router.use(authenticate, requireActiveStatus);

// File upload (audio). Store in memory; transcribe server-side if requested.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 300 * 1024 * 1024 // 300MB
  }
});

const transcribeUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 300 * 1024 * 1024 // 300MB
  }
});

router.get('/contact-documentation', apiLimiter, contactDocumentation.list);
router.get('/contact-documentation/:type/:id', apiLimiter, contactDocumentation.detail);
router.post('/contact-documentation/:type/:id', apiLimiter, contactDocumentation.save);

// Personal text-generation notes do not expose any client chart or session.
// Each handler separately checks staff role, organization membership and rollout.
router.get('/quick-copy/catalog', apiLimiter, getTherapyNotesQuickCopyCatalog);
router.get('/quick-copy/service-reference/:serviceCode', apiLimiter, getTherapyNotesQuickCopyServiceReference);
router.get('/quick-copy/recent', apiLimiter, listTherapyNotesQuickCopyNotes);
router.get('/quick-copy/notes/:id', apiLimiter, getTherapyNotesQuickCopyNote);
router.patch('/quick-copy/notes/:id', apiLimiter, updateTherapyNotesQuickCopyNote);
router.post('/quick-copy/generate', apiLimiter, generateTherapyNotesQuickCopy);
router.post('/quick-copy/transcribe', apiLimiter, transcribeUpload.single('audio'), transcribeTherapyNotesQuickCopy);

// Operational contact notes stay available above this clinical-content boundary.
router.use(excludeSupportClinicalContent);
router.post('/dictation', noteAidLimiter, excludeFamilyClinicalWorkspace, clinicalSessionAudioUpload.single('audio'),
  requireClinicalChart, transcribeClinicianDictation);
router.get('/clients/:clientId/confidential-entries', clinicalWorkspaceLimiter, excludeFamilyClinicalWorkspace, requireClinicalChart, confidential.listEntries);
router.get('/clients/:clientId/confidential-entries/:entryId', clinicalWorkspaceLimiter, excludeFamilyClinicalWorkspace, requireClinicalChart, confidential.readEntry);
router.post('/clients/:clientId/confidential-entries', clinicalWorkspaceLimiter, excludeFamilyClinicalWorkspace, requireClinicalChart, confidential.createEntry);
router.get('/clients/:clientId/enrollment-sections', clinicalWorkspaceLimiter, excludeFamilyClinicalWorkspace, requireClinicalChart, confidential.enrollmentSections);
// POST keeps the clinical search text out of URL/access-log query strings.
router.post('/diagnosis-search',clinicalWorkspaceLimiter,searchDiagnosisCatalog);
router.get('/appointment-alerts',clinicalWorkspaceLimiter,getClinicalAppointmentAlerts);
router.post('/appointment-alerts/:appointmentId/acknowledge',clinicalWorkspaceLimiter,acknowledgeClinicalAppointmentAlert);
router.get('/context', clinicalWorkspaceLimiter, [query('agencyId').isInt({ min: 1 })], getClinicalNotesContext);
router.get('/drafts/:draftId/pdf', clinicalWorkspaceLimiter, downloadClinicalDraftPdf);
router.get('/drafts/:draftId/appointment',clinicalWorkspaceLimiter,repairClinicalDraftAppointment);
router.post('/drafts/:draftId/appointment',clinicalWorkspaceLimiter,repairClinicalDraftAppointment);
router.get('/termination-outcomes', clinicalWorkspaceLimiter, getTerminationOutcomeStats);
router.post('/interactive-complexity', noteAidLimiter, generateInteractiveComplexitySentence);

router.get('/work-queue', clinicalWorkspaceLimiter, listNoteAidWorkQueue);

router.put(
  '/work-queue',
  clinicalWorkspaceLimiter,
  [body('items').isArray({ max: 500 })],
  syncNoteAidWorkQueue
);

router.post(
  '/work-queue',
  clinicalWorkspaceLimiter,
  [body('items').isArray({ min: 1, max: 200 })],
  appendNoteAidWorkQueue
);

router.patch(
  '/work-queue/:id',
  clinicalWorkspaceLimiter,
  [param('id').isInt({ min: 1 })],
  patchNoteAidWorkQueueItem
);

router.delete(
  '/work-queue/:id',
  clinicalWorkspaceLimiter,
  [param('id').isInt({ min: 1 })],
  deleteNoteAidWorkQueueItem
);

router.delete('/work-queue', clinicalWorkspaceLimiter, clearNoteAidWorkQueue);

router.get('/programs', clinicalWorkspaceLimiter, [query('agencyId').isInt({ min: 1 })], listClinicalNotePrograms);

router.post(
  '/consent-task',
  clinicalWorkspaceLimiter,
  [
    body('agencyId').isInt({ min: 1 }),
    body('templateId').isInt({ min: 1 }),
    body('title').isString().isLength({ min: 1, max: 255 }),
    body('clientId').optional().isInt({ min: 1 })
  ],
  createConsentTask
);

router.get(
  '/recent',
  clinicalWorkspaceLimiter,
  [
    query('agencyId').isInt({ min: 1 }),
    query('days').optional().isInt({ min: 1, max: 2555 }),
    query('archiveStatus').optional().isIn(['all', 'active', 'archived']),
    query('status').optional().isIn(['all', 'active', 'archived']),
    query('clientIds').optional().isString(),
    query('draftId').optional().isInt({ min: 1 }),
    query('allAccessible').optional()
  ],
  listRecentClinicalNoteDrafts
);

router.post(
  '/drafts',
  clinicalWorkspaceLimiter,
  [
    body('agencyId').isInt({ min: 1 }),
    // Frontend autosave sends nulls for empty fields; treat null as "not provided".
    body('serviceCode').optional({ nullable: true }).isString().isLength({ min: 1, max: 32 }),
    body('programId').optional({ nullable: true }).isInt({ min: 1 }),
    body('programLabel').optional({ nullable: true }).isString().isLength({ min: 1, max: 120 }),
    body('dateOfService').optional({ nullable: true }).isString().isLength({ min: 1, max: 32 }),
    body('initials').optional({ nullable: true }).isString().isLength({ min: 1, max: 16 }),
    body('inputText').optional({ nullable: true }).isString().isLength({ min: 0, max: 1500000 })
  ],
  createClinicalNoteDraft
);

router.patch(
  '/drafts/:draftId',
  clinicalWorkspaceLimiter,
  [
    param('draftId').isInt({ min: 1 }),
    body('agencyId').isInt({ min: 1 }),
    body('serviceCode').optional({ nullable: true }).isString().isLength({ min: 1, max: 32 }),
    body('programId').optional({ nullable: true }).isInt({ min: 1 }),
    body('programLabel').optional({ nullable: true }).isString().isLength({ min: 1, max: 120 }),
    body('dateOfService').optional({ nullable: true }).isString().isLength({ min: 1, max: 32 }),
    body('initials').optional({ nullable: true }).isString().isLength({ min: 0, max: 16 }),
    body('inputText').optional({ nullable: true }).isString().isLength({ min: 0, max: 1500000 })
  ],
  patchClinicalNoteDraft
);

router.post(
  '/drafts/delete',
  clinicalWorkspaceLimiter,
  [
    body('agencyId').isInt({ min: 1 }),
    body('draftIds').isArray({ min: 1, max: 200 }),
    body('draftIds.*').isInt({ min: 1 })
  ],
  deleteClinicalNoteDrafts
);

router.post(
  '/audit',
  clinicalWorkspaceLimiter,
  [
    body('action').isString().isLength({ min: 1, max: 64 }),
    body('agencyId').optional({ nullable: true }).isInt({ min: 1 }),
    body('clientId').optional({ nullable: true }).isInt({ min: 1 })
  ],
  recordNoteAidAudit
);

router.post(
  '/drafts/:draftId/archive',
  clinicalWorkspaceLimiter,
  [
    param('draftId').isInt({ min: 1 }),
    body('agencyId').isInt({ min: 1 }),
    body('archived').optional().isBoolean()
  ],
  archiveClinicalNoteDraft
);

router.post(
  '/transcribe',
  noteAidLimiter,
  transcribeUpload.single('audio'),
  [body('agencyId').isInt({ min: 1 }), body('languageCode').optional().isString().isLength({ min: 2, max: 10 })],
  transcribeClinicalNoteAudio
);

router.post(
  '/generate',
  noteAidLimiter,
  upload.single('audio'),
  [
    body('agencyId').isInt({ min: 1 }),
    body('serviceCode').optional().isString().isLength({ min: 1, max: 32 }),
    body('autoSelectCode').optional().isBoolean(),
    body('quickCopyOnly').optional().isBoolean(),
    body('transcriptSource').optional().isString().isLength({ min: 1, max: 32 }),
    body('programId').optional().isInt({ min: 1 }),
    body('programLabel').optional().isString().isLength({ min: 1, max: 120 }),
    body('dateOfService').optional().isString().isLength({ min: 1, max: 32 }),
    body('initials').optional().isString().isLength({ min: 0, max: 16 }),
    body('revisionInstruction').optional().isString().isLength({ min: 1, max: 1500 }),
    body('inputText').isString().isLength({ min: 0, max: 1500000 }),
    body('draftId').optional().isInt({ min: 1 }),
    body('includeInteractiveComplexity').optional(),
    body('dateWritten').optional().isString().isLength({ min: 1, max: 32 })
  ],
  generateClinicalNote
);

export default router;
