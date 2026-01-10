import express from 'express';
import {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getAvailableParameters,
  previewTemplate
} from '../controllers/emailTemplate.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get available parameters (no template ID needed)
router.get('/parameters', getAvailableParameters);

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

export default router;
