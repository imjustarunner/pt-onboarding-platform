import express from 'express';
import multer from 'multer';
import { body, query } from 'express-validator';
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

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// Note Aid is a logged-in tool; also block archived/expired users.
router.use(authenticate, requireActiveStatus);

router.get('/tools', [query('agencyId').isInt({ min: 1 })], listNoteAidTools);
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

