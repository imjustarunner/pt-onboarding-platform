import express from 'express';
import { body } from 'express-validator';
import multer from 'multer';
import {
  listLetterheadTemplates,
  getLetterheadTemplate,
  createLetterheadTemplate,
  uploadLetterheadAsset,
  updateLetterheadTemplate,
  archiveLetterheadTemplate,
  restoreLetterheadTemplate
} from '../controllers/letterheadTemplate.controller.js';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB (letterhead assets should be small)
});

const validateCreate = [
  body('name').notEmpty().withMessage('name is required'),
  body('agencyId').optional(),
  body('organizationId').optional(),
  body('templateType').optional().isIn(['svg', 'png', 'html']).withMessage('templateType must be svg, png, or html'),
  body('pageSize').optional().isIn(['letter', 'a4']).withMessage('pageSize must be letter or a4'),
  body('orientation').optional().isIn(['portrait', 'landscape']).withMessage('orientation must be portrait or landscape')
];

router.get('/', authenticate, requireBackofficeAdmin, listLetterheadTemplates);
router.get('/:id', authenticate, requireBackofficeAdmin, getLetterheadTemplate);

// HTML letterhead (header/footer/css stored in DB)
router.post('/', authenticate, requireBackofficeAdmin, validateCreate, createLetterheadTemplate);

// SVG/PNG upload letterhead
router.post('/upload', authenticate, requireBackofficeAdmin, upload.single('file'), validateCreate, uploadLetterheadAsset);

router.put('/:id', authenticate, requireBackofficeAdmin, updateLetterheadTemplate);
router.post('/:id/archive', authenticate, requireBackofficeAdmin, archiveLetterheadTemplate);
router.post('/:id/restore', authenticate, requireBackofficeAdmin, restoreLetterheadTemplate);

export default router;

