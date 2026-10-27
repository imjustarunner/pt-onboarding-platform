import express from 'express';
import { requireTrainingModuleAccess } from '../middleware/trainingModuleAccess.middleware.js';
import { body } from 'express-validator';
import { getModuleContent, addModuleContent, updateModuleContent, deleteModuleContent } from '../controllers/content.controller.js';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';
import { normalizeContentType, TRAINING_CONTENT_TYPE_SET } from '../constants/trainingContentTypes.js';

const router = express.Router();

const validateContent = [
  body('contentType')
    .custom((value, { req }) => {
      const normalized = normalizeContentType(value, req.body?.contentData || {});
      if (!TRAINING_CONTENT_TYPE_SET.has(normalized)) {
        throw new Error('Invalid content type');
      }
      req.body.contentType = normalized;
      return true;
    }),
  body('contentData').isObject().withMessage('Content data must be an object'),
  body('orderIndex').optional().isInt({ min: 0 }),
  body('title').optional({ nullable: true }).isString().isLength({ max: 255 }),
  body('settings').optional({ nullable: true }).isObject()
];

router.get('/:id/content', authenticate, requireTrainingModuleAccess, getModuleContent);
router.post('/:id/content', authenticate, requireBackofficeAdmin, requireTrainingModuleAccess, validateContent, addModuleContent);
router.put('/:id/content/:contentId', authenticate, requireBackofficeAdmin, requireTrainingModuleAccess, validateContent, updateModuleContent);
router.delete('/:id/content/:contentId', authenticate, requireBackofficeAdmin, requireTrainingModuleAccess, deleteModuleContent);

export default router;

