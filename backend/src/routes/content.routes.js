import express from 'express';
import { body } from 'express-validator';
import { getModuleContent, addModuleContent, updateModuleContent, deleteModuleContent } from '../controllers/content.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

const validateContent = [
  body('contentType').isIn(['video', 'slide', 'quiz', 'acknowledgment', 'text']).withMessage('Invalid content type'),
  body('contentData').isObject().withMessage('Content data must be an object'),
  body('orderIndex').optional().isInt({ min: 0 })
];

router.get('/:id/content', authenticate, getModuleContent);
router.post('/:id/content', authenticate, requireAdmin, validateContent, addModuleContent);
router.put('/:id/content/:contentId', authenticate, requireAdmin, validateContent, updateModuleContent);
router.delete('/:id/content/:contentId', authenticate, requireAdmin, deleteModuleContent);

export default router;

