import express from 'express';
import { body } from 'express-validator';
import {
  getAllFonts,
  getFontById,
  getFontFamilies,
  uploadFont,
  updateFont,
  deleteFont,
  upload
} from '../controllers/font.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

// Validation middleware
const validateFont = [
  body('name').trim().notEmpty().withMessage('Font name is required'),
  body('familyName').trim().notEmpty().withMessage('Font family name is required'),
  body('agencyId').optional()
];

// Public route for font families (needed for font selector) - must be before /:id route
router.get('/families', getFontFamilies);

// Authenticated routes
router.use(authenticate);

router.get('/', getAllFonts);
router.get('/:id', getFontById);

// Admin routes
router.post('/', requireAdmin, upload.single('fontFile'), validateFont, uploadFont);
router.put('/:id', requireAdmin, upload.single('fontFile'), validateFont, updateFont);
router.delete('/:id', requireAdmin, deleteFont);

export default router;
