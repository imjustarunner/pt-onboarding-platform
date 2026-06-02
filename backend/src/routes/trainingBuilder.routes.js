import express from 'express';
import multer from 'multer';
import { body, query } from 'express-validator';
import { authenticate, requireActiveStatus } from '../middleware/auth.middleware.js';
import { trainingBuilderLimiter } from '../middleware/rateLimiter.middleware.js';
import {
  listTrainingKbDocuments,
  uploadTrainingKbDocumentHandler,
  deleteTrainingKbDocumentHandler,
  generateModuleDraftHandler,
  applyModuleDraftHandler
} from '../controllers/trainingBuilder.controller.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

router.use(authenticate, requireActiveStatus);

router.get(
  '/kb/documents',
  [query('agencyId').isInt({ min: 1 }), query('folder').optional().isString()],
  listTrainingKbDocuments
);

router.post(
  '/kb/upload',
  upload.single('file'),
  [
    body('agencyId').isInt({ min: 1 }),
    body('folder').optional().isString().isLength({ max: 64 })
  ],
  uploadTrainingKbDocumentHandler
);

router.delete('/kb/documents/:id', deleteTrainingKbDocumentHandler);

router.post(
  '/generate-module-draft',
  trainingBuilderLimiter,
  upload.array('files', 10),
  generateModuleDraftHandler
);

router.post(
  '/apply-module-draft',
  [
    body('agencyId').isInt({ min: 1 }),
    body('draft').isObject(),
    body('generationRequestId').optional().isInt({ min: 1 }),
    body('trainingFocusId').optional().isInt({ min: 1 }),
    body('trackOrderIndex').optional().isInt({ min: 0 })
  ],
  applyModuleDraftHandler
);

export default router;
