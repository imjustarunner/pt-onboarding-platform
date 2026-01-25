import express from 'express';
import { body } from 'express-validator';
import { login, register, approvedEmployeeLogin, logout, logActivity, passwordlessTokenLogin, passwordlessTokenLoginFromBody, verifyPendingIdentity, validateSetupToken, initialSetup, validateResetToken, resetPasswordWithToken, googleOAuthStart, googleOAuthCallback } from '../controllers/auth.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';
import { requireAdminOrFirstUser } from '../middleware/conditionalAdmin.middleware.js';
import { authLimiter } from '../middleware/rateLimiter.middleware.js';

const router = express.Router();

const validateLogin = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required')
];

const validateRegister = [
  body('email')
    .optional()
    .custom((value, { req }) => {
      // Check if email field exists in request body
      if (!req.body.hasOwnProperty('email')) {
        return true; // Field not in request, valid (optional)
      }
      // If value is undefined, null, or empty string, it's valid (optional)
      if (value === undefined || value === null || value === '') {
        return true;
      }
      // If value is provided, it must be a string
      if (typeof value !== 'string') {
        throw new Error('Email must be a string');
      }
      // If value is provided and not empty after trim, validate as email
      const trimmed = value.trim();
      if (trimmed === '') {
        return true; // Empty string is valid for optional field
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmed)) {
        throw new Error('Email must be a valid email address');
      }
      return true;
    })
    .customSanitizer((value) => {
      if (value && typeof value === 'string' && value.trim()) {
        return value.toLowerCase().trim();
      }
      return value;
    }), // Email is now optional for pending users
  body('personalEmail')
    .optional()
    .custom((value, { req }) => {
      // Check if personalEmail field exists in request body
      if (!req.body.hasOwnProperty('personalEmail')) {
        return true; // Field not in request, valid (optional)
      }
      // If value is undefined, null, or empty string, it's valid (optional)
      if (value === undefined || value === null || value === '') {
        return true;
      }
      // If value is provided, it must be a string
      if (typeof value !== 'string') {
        throw new Error('Personal email must be a string');
      }
      // If value is provided and not empty after trim, validate as email
      const trimmed = value.trim();
      if (trimmed === '') {
        return true; // Empty string is valid for optional field
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmed)) {
        throw new Error('Personal email must be a valid email address');
      }
      return true;
    })
    .customSanitizer((value) => {
      if (value && typeof value === 'string' && value.trim()) {
        return value.toLowerCase().trim();
      }
      return value;
    }), // Personal email optional
  // Password is no longer required - temporary password will be auto-generated
  body('firstName')
    .optional({ checkFalsy: true, nullable: true })
    .trim()
    .custom((value) => {
      // If value is provided, it must not be empty after trimming
      if (value !== undefined && value !== null && value !== '') {
        return value.trim().length > 0;
      }
      return true; // Empty/null/undefined is valid (optional)
    })
    .withMessage('First name cannot be empty if provided'),
  body('lastName')
    .trim()
    .notEmpty()
    .withMessage('Last name is required')
    .bail(), // Last name is required
  body('phoneNumber')
    .optional({ checkFalsy: true, nullable: true })
    .trim()
    .custom((value) => {
      // If value is provided, allow it (even if empty after trim)
      return true;
    }),
  body('role')
    .optional()
    .isIn(['super_admin', 'admin', 'support', 'supervisor', 'clinical_practice_assistant', 'staff', 'provider', 'school_staff', 'clinician', 'facilitator', 'intern']),
  body('agencyIds').optional().isArray().withMessage('Agency IDs must be an array'),
  body('agencyIds.*').optional().isInt().withMessage('Each agency ID must be an integer'),
  body('bypassDuplicateCheck').optional().isBoolean().withMessage('bypassDuplicateCheck must be a boolean')
];

router.post('/login', authLimiter, validateLogin, login);
router.get('/google/start', googleOAuthStart);
router.get('/google/callback', googleOAuthCallback);
router.post('/approved-employee-login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required')
], approvedEmployeeLogin);
router.post('/logout', authenticate, logout);
router.post('/activity-log', authenticate, logActivity);
router.post('/register', requireAdminOrFirstUser, validateRegister, register);
// Old route: token in URL (kept for backward compatibility)
router.post('/passwordless-login/:token', passwordlessTokenLogin);

// New route: token in request body (preferred, more secure - tokens not in URLs)
router.post('/passwordless-login', [
  body('token')
    .notEmpty()
    .withMessage('Token is required')
    .isString()
    .withMessage('Token must be a string')
    .trim(),
  body('lastName')
    .optional()
    .trim()
    .isString()
    .withMessage('Last name must be a string')
], passwordlessTokenLoginFromBody);

router.post('/pending/verify-identity/:token', verifyPendingIdentity);// Initial setup routes (for first-time password creation)
router.get('/validate-setup-token/:token', validateSetupToken);
router.post('/initial-setup/:token', [
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters')
], initialSetup);

// Password reset routes (token-based, forces user to set a new password)
router.get('/validate-reset-token/:token', validateResetToken);
router.post('/reset-password/:token', [
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters')
], resetPasswordWithToken);

export default router;
