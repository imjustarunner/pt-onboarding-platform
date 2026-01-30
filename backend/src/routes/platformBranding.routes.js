import express from 'express';
import {
  getPlatformBranding,
  updatePlatformBranding,
  restorePlatformBranding
} from '../controllers/platformBranding.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireSuperAdmin } from '../middleware/auth.middleware.js';
import { body } from 'express-validator';

const router = express.Router();

// Get branding is public (for frontend to apply)
router.get('/', getPlatformBranding);

// Update requires authentication and super admin role
router.use(authenticate);
router.use(requireSuperAdmin);

// Restore from exported backup (JSON body, snake_case as returned by GET /platform-branding)
router.post('/restore', restorePlatformBranding);

router.put(
  '/',
  [
    body('tagline').optional().isLength({ max: 255 }).withMessage('Tagline must be 255 characters or less'),
    body('primaryColor').optional().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Invalid primary color format'),
    body('secondaryColor').optional().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Invalid secondary color format'),
    body('accentColor').optional().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Invalid accent color format'),
    body('successColor').optional().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Invalid success color format'),
    body('backgroundColor').optional().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Invalid background color format'),
    body('errorColor').optional().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Invalid error color format'),
    body('warningColor').optional().matches(/^#[0-9A-Fa-f]{6}$/).withMessage('Invalid warning color format'),
    body('peopleOpsTerm').optional().isLength({ max: 100 }).withMessage('People Operations Term must be 100 characters or less')
  ],
  updatePlatformBranding
);

export default router;

