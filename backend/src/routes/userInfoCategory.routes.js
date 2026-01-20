import express from 'express';
import { body } from 'express-validator';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';
import {
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory
} from '../controllers/userInfoCategory.controller.js';

const router = express.Router();

const validateCategory = [
  body('categoryLabel').trim().notEmpty().withMessage('Category label is required'),
  body('categoryKey').optional().trim(),
  body('isPlatformTemplate').optional().isBoolean(),
  body('agencyId').optional().isInt({ min: 1 }),
  body('orderIndex').optional().isInt({ min: 0 })
];

router.get('/', authenticate, getAllCategories);
router.post('/', authenticate, requireBackofficeAdmin, validateCategory, createCategory);
router.put('/:id', authenticate, requireBackofficeAdmin, validateCategory, updateCategory);
router.delete('/:id', authenticate, requireBackofficeAdmin, deleteCategory);

export default router;

