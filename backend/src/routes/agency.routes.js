import express from 'express';
import { body } from 'express-validator';
import { getAllAgencies, getAgencyById, getAgencyBySlug, createAgency, updateAgency, archiveAgency, restoreAgency, getArchivedAgencies, getAgencyByPortalUrl, getThemeByPortalUrl, getLoginThemeByPortalUrl } from '../controllers/agency.controller.js';
import { authenticate, requireAdmin, requireSuperAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

// Common validation for icon IDs (allows null to clear icons)
const validateIconId = (fieldName) => body(fieldName).optional().custom((value) => {
  if (value === null || value === undefined || value === '') return true;
  const num = parseInt(value);
  return !isNaN(num) && num > 0;
}).withMessage(`${fieldName} must be a positive integer or null`);

// Validation for creating agencies (name and slug required)
const validateCreateAgency = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('slug').trim().notEmpty().withMessage('Slug is required').matches(/^[a-z0-9-]+$/).withMessage('Slug must be lowercase alphanumeric with hyphens only'),
  body('logoUrl').optional().custom((value) => {
    if (!value || value === null || value === '') return true;
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }).withMessage('Logo URL must be a valid URL'),
  body('colorPalette').optional().isObject().withMessage('Color palette must be an object'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  validateIconId('trainingFocusDefaultIconId'),
  validateIconId('moduleDefaultIconId'),
  validateIconId('userDefaultIconId'),
  validateIconId('documentDefaultIconId'),
  validateIconId('progressDashboardIconId'),
  validateIconId('manageModulesIconId'),
  validateIconId('manageDocumentsIconId'),
  validateIconId('manageUsersIconId'),
  validateIconId('settingsIconId'),
  body('certificateTemplateUrl').optional().isURL().withMessage('Certificate template URL must be a valid URL'),
  body('onboardingTeamEmail').optional({ nullable: true, checkFalsy: true }).custom((value) => {
    if (!value || value === null || value === '' || value === undefined) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }).withMessage('Onboarding team email must be a valid email address or empty'),
  body('phoneNumber').optional({ nullable: true, checkFalsy: true }).custom((value) => {
    if (!value || value === null || value === '' || value === undefined) return true;
    return /^[\d\s\(\)\-\+\.]+$/.test(value);
  }).withMessage('Phone number must be a valid phone format or empty'),
  body('phoneExtension').optional({ nullable: true, checkFalsy: true }).matches(/^[a-zA-Z0-9]{0,10}$/).withMessage('Phone extension must be alphanumeric and max 10 characters'),
  body('portalUrl').optional({ nullable: true, checkFalsy: true }).custom((value) => {
    if (!value || value === null || value === '' || value === undefined) return true;
    return /^[a-z0-9-]+$/.test(value);
  }).withMessage('Portal URL must be lowercase alphanumeric with hyphens only or empty'),
  body('themeSettings').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    if (typeof value === 'object') return true;
    if (typeof value === 'string') {
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }).withMessage('Theme settings must be a valid JSON object'),
  body('customParameters').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    if (typeof value === 'object') return true;
    if (typeof value === 'string') {
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }).withMessage('Custom parameters must be a valid JSON object')
];

// Validation for updating agencies (name and slug optional, can update just branding)
const validateUpdateAgency = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('slug').optional().trim().notEmpty().withMessage('Slug cannot be empty').matches(/^[a-z0-9-]+$/).withMessage('Slug must be lowercase alphanumeric with hyphens only'),
  body('logoUrl').optional().custom((value) => {
    // Allow null, undefined, or empty string
    if (!value || value === null || value === '' || value === undefined) return true;
    // If a value is provided, it must be a valid URL
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }).withMessage('Logo URL must be a valid URL or empty'),
  body('colorPalette').optional().isObject().withMessage('Color palette must be an object'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  validateIconId('trainingFocusDefaultIconId'),
  validateIconId('moduleDefaultIconId'),
  validateIconId('userDefaultIconId'),
  validateIconId('documentDefaultIconId'),
  validateIconId('progressDashboardIconId'),
  validateIconId('manageModulesIconId'),
  validateIconId('manageDocumentsIconId'),
  validateIconId('manageUsersIconId'),
  validateIconId('settingsIconId'),
  body('certificateTemplateUrl').optional().custom((value) => {
    // Allow null, undefined, or empty string
    if (!value || value === null || value === '' || value === undefined) return true;
    // If a value is provided, validate it's a URL
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  }).withMessage('Certificate template URL must be a valid URL or empty'),
  body('onboardingTeamEmail').optional({ nullable: true, checkFalsy: true }).custom((value) => {
    if (!value || value === null || value === '' || value === undefined) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }).withMessage('Onboarding team email must be a valid email address or empty'),
  body('phoneNumber').optional({ nullable: true, checkFalsy: true }).custom((value) => {
    if (!value || value === null || value === '' || value === undefined) return true;
    return /^[\d\s\(\)\-\+\.]+$/.test(value);
  }).withMessage('Phone number must be a valid phone format or empty'),
  body('phoneExtension').optional({ nullable: true, checkFalsy: true }).matches(/^[a-zA-Z0-9]{0,10}$/).withMessage('Phone extension must be alphanumeric and max 10 characters'),
  body('portalUrl').optional({ nullable: true, checkFalsy: true }).custom((value) => {
    if (!value || value === null || value === '' || value === undefined) return true;
    return /^[a-z0-9-]+$/.test(value);
  }).withMessage('Portal URL must be lowercase alphanumeric with hyphens only or empty'),
  body('themeSettings').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    if (typeof value === 'object') return true;
    if (typeof value === 'string') {
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }).withMessage('Theme settings must be a valid JSON object'),
  body('customParameters').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    if (typeof value === 'object') return true;
    if (typeof value === 'string') {
      try {
        JSON.parse(value);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }).withMessage('Custom parameters must be a valid JSON object')
];

// Public routes (no auth required) - must come before /:id route
router.get('/slug/:slug', getAgencyBySlug); // Get organization by slug (supports all organization types)
router.get('/portal/:portalUrl', getAgencyByPortalUrl);
router.get('/portal/:portalUrl/theme', getThemeByPortalUrl);
router.get('/portal/:portalUrl/login-theme', getLoginThemeByPortalUrl);

// Protected routes
router.get('/', authenticate, getAllAgencies);
router.get('/archived', authenticate, requireSuperAdmin, getArchivedAgencies);
router.get('/:id', authenticate, getAgencyById);
router.post('/', authenticate, requireAdmin, validateCreateAgency, createAgency);
router.put('/:id', authenticate, requireAdmin, validateUpdateAgency, updateAgency);
router.post('/:id/archive', authenticate, requireSuperAdmin, archiveAgency);
router.post('/:id/restore', authenticate, requireSuperAdmin, restoreAgency);

export default router;

