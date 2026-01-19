import express from 'express';
import { body } from 'express-validator';
import {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  applyTemplate,
  getTemplateState,
  setDefaultTemplate,
  clearCurrentTemplate,
  getSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule
} from '../controllers/brandingTemplate.controller.js';
import { authenticate, requireAdmin, requireSuperAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

// Validation middleware
const validateTemplate = [
  body('name').trim().notEmpty().withMessage('Template name is required'),
  body('description').optional().trim(),
  body('scope').isIn(['platform', 'agency']).withMessage('Scope must be platform or agency'),
  body('agencyId').optional().custom((value) => {
    if (value === null || value === undefined || value === '') return true;
    const num = parseInt(value, 10);
    if (isNaN(num)) {
      throw new Error('Agency ID must be an integer');
    }
    return true;
  }),
  body('isShared').optional().custom((value) => {
    if (value === undefined || value === null) return true;
    return typeof value === 'boolean' || value === 'true' || value === 'false';
  }).withMessage('isShared must be a boolean'),
  body('templateData').optional().custom((value) => {
    if (value === undefined || value === null) return true;
    return typeof value === 'object' && !Array.isArray(value);
  }).withMessage('Template data must be an object'),
  body('includeFields').optional().custom((value) => {
    if (value === undefined || value === null) return true;
    return typeof value === 'object' && !Array.isArray(value);
  }).withMessage('Include fields must be an object')
];

const validateSchedule = [
  body('scope').isIn(['platform', 'agency']).withMessage('Scope must be platform or agency'),
  body('agencyId').optional().isInt().withMessage('Agency ID must be an integer'),
  body('startDate').isISO8601().withMessage('Start date must be a valid date'),
  body('endDate').isISO8601().withMessage('End date must be a valid date'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
];

const validateApply = [
  body('targetScope').isIn(['platform', 'agency']).withMessage('Target scope must be platform or agency'),
  body('targetAgencyId').optional().isInt().withMessage('Target agency ID must be an integer')
];

// Template routes
router.get('/', authenticate, getTemplates);
router.get('/state', authenticate, getTemplateState);
router.get('/:id', authenticate, getTemplate);
// Admin or super admin can create templates (controller handles scope restrictions)
router.post('/', authenticate, requireAdmin, validateTemplate, createTemplate);
router.put('/:id', authenticate, requireAdmin, validateTemplate, updateTemplate);
router.delete('/:id', authenticate, requireAdmin, deleteTemplate);
router.post('/:id/apply', authenticate, requireAdmin, validateApply, applyTemplate);
router.post('/:id/set-default', authenticate, requireAdmin, validateApply, setDefaultTemplate);
router.post('/clear-current', authenticate, requireAdmin, validateApply, clearCurrentTemplate);

// Schedule routes
router.get('/:id/schedules', authenticate, getSchedules);
router.post('/:id/schedules', authenticate, requireAdmin, validateSchedule, createSchedule);
router.put('/schedules/:id', authenticate, requireAdmin, validateSchedule, updateSchedule);
router.delete('/schedules/:id', authenticate, requireAdmin, deleteSchedule);

export default router;
