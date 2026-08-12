import express from 'express';
import {
  getTemplates,
  getTemplate,
  resolveTemplate,
  listTemplatesForType,
  setDefaultTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getAvailableParameters,
  previewTemplate,
  sendTemplateEmail,
  aiDraftTemplateEmail
} from '../controllers/emailTemplate.controller.js';
import { authenticate, requireAgencyAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get available parameters (no template ID needed)
router.get('/parameters', getAvailableParameters);

// Resolve agency-or-platform template by type (must be before /:id)
router.get('/resolve', resolveTemplate);
router.get('/for-type', listTemplatesForType);
router.post('/:id/set-default', setDefaultTemplate);

// Get all templates
router.get('/', getTemplates);

// Get single template
router.get('/:id', getTemplate);

// Create template
router.post('/', createTemplate);

// Update template
router.put('/:id', updateTemplate);

// Delete template
router.delete('/:id', deleteTemplate);

// Preview template with sample data
router.post('/:id/preview', previewTemplate);

// Manual send + AI draft (admin/staff only)
router.post('/:id/send', requireAgencyAdmin, sendTemplateEmail);
router.post('/:id/ai-draft', requireAgencyAdmin, aiDraftTemplateEmail);

export default router;
