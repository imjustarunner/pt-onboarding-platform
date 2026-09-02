import express from 'express';
import multer from 'multer';
import { body, query, param } from 'express-validator';
import { authenticate, requireActiveStatus } from '../middleware/auth.middleware.js';
import { noteAidLimiter } from '../middleware/rateLimiter.middleware.js';
import {
  listNoteAidTools,
  executeNoteAidTool,
  getNoteAidKnowledgeBaseStatus,
  getNoteAidSettings,
  updateNoteAidSettings,
  uploadNoteAidDocument,
  listNoteAidDocuments
} from '../controllers/noteAid.controller.js';
import {
  listNoteAidAgencyCatalog,
  adminListNoteAidAgencyCatalog,
  upsertNoteAidAgencySetting,
  createNoteAidCustomAid,
  updateNoteAidCustomAid,
  listNoteAidAssignments,
  setNoteAidUserAssignment,
  listNoteAidCatalogAgencyUsers
} from '../controllers/noteAidCatalog.controller.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// Note Aid is a logged-in tool; also block archived/expired users.
router.use(authenticate, requireActiveStatus);

router.get('/tools', [query('agencyId').isInt({ min: 1 })], listNoteAidTools);
router.get('/catalog', [query('agencyId').isInt({ min: 1 })], listNoteAidAgencyCatalog);
router.get('/catalog/admin', [query('agencyId').isInt({ min: 1 })], adminListNoteAidAgencyCatalog);
router.post(
  '/catalog/settings',
  [
    body('agencyId').isInt({ min: 1 }),
    body('catalogAidId').isString().isLength({ min: 1, max: 64 }),
    body('enabled').optional(),
    body('titleOverride').optional().isString().isLength({ max: 255 }),
    body('attachableToSession').optional(),
    body('attachableToClaim').optional(),
    body('sortOrder').optional().isInt()
  ],
  upsertNoteAidAgencySetting
);
router.post(
  '/catalog/custom',
  [
    body('agencyId').isInt({ min: 1 }),
    body('title').isString().isLength({ min: 1, max: 255 }),
    body('guidance').optional().isString(),
    body('systemPrompt').optional().isString(),
    body('trainingNotes').optional().isString(),
    body('baseToolId').optional().isString().isLength({ max: 96 }),
    body('serviceCode').optional().isString().isLength({ max: 16 }),
    body('kbFolders').optional().isArray(),
    body('attachableToSession').optional(),
    body('attachableToClaim').optional(),
    body('enabled').optional()
  ],
  createNoteAidCustomAid
);
router.patch(
  '/catalog/custom/:id',
  [
    param('id').isInt({ min: 1 }),
    body('agencyId').isInt({ min: 1 }),
    body('title').optional().isString().isLength({ min: 1, max: 255 }),
    body('guidance').optional().isString(),
    body('systemPrompt').optional().isString(),
    body('trainingNotes').optional().isString(),
    body('baseToolId').optional().isString().isLength({ max: 96 }),
    body('serviceCode').optional().isString().isLength({ max: 16 }),
    body('kbFolders').optional().isArray(),
    body('attachableToSession').optional(),
    body('attachableToClaim').optional(),
    body('enabled').optional()
  ],
  updateNoteAidCustomAid
);
router.get('/catalog/assignments', [query('agencyId').isInt({ min: 1 })], listNoteAidAssignments);
router.get('/catalog/users', [query('agencyId').isInt({ min: 1 })], listNoteAidCatalogAgencyUsers);
router.post(
  '/catalog/assignments',
  [
    body('agencyId').isInt({ min: 1 }),
    body('userId').isInt({ min: 1 }),
    body('catalogAidId').optional().isString().isLength({ max: 64 }),
    body('customAidId').optional().isInt({ min: 1 }),
    body('isEnabled').optional()
  ],
  setNoteAidUserAssignment
);
router.get('/settings', [query('agencyId').isInt({ min: 1 })], getNoteAidSettings);
router.get('/settings/files', [query('agencyId').isInt({ min: 1 })], listNoteAidDocuments);
router.post(
  '/settings',
  [
    body('agencyId').isInt({ min: 1 }),
    body('kbFolderOverrides').optional().isObject(),
    body('kbExtraFolders').optional().isArray(),
    body('noteAidProgramOptions').optional().isArray()
  ],
  updateNoteAidSettings
);
router.post(
  '/settings/upload',
  upload.single('file'),
  [
    body('agencyId').isInt({ min: 1 }),
    body('folder').isString().isLength({ min: 1, max: 120 })
  ],
  uploadNoteAidDocument
);
router.get('/kb-status', [query('agencyId').isInt({ min: 1 }), query('refresh').optional().isBoolean()], getNoteAidKnowledgeBaseStatus);

router.post(
  '/execute',
  noteAidLimiter,
  [
    body('agencyId').isInt({ min: 1 }),
    body('toolId').isString().isLength({ min: 1, max: 64 }),
    body('inputText').isString().isLength({ min: 1, max: 12000 })
  ],
  executeNoteAidTool
);

export default router;

