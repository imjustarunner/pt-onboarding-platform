import express from 'express';
import { body } from 'express-validator';
import { getAllModules, getModuleById, createModule, updateModule, archiveModule, restoreModule, deleteModule, getArchivedModules, createSharedModule, getSharedModules, copyModule, getCopyPreview, assignModuleToUsers } from '../controllers/module.controller.js';
import { getModuleFormDefinition, submitModuleForm, uploadModuleFormFile } from '../controllers/moduleForm.controller.js';
import { saveResponse, getResponses } from '../controllers/moduleResponse.controller.js';
import { authenticate, requireBackofficeAdmin, requireSuperAdmin, requireCapability } from '../middleware/auth.middleware.js';

const router = express.Router();

// All module routes require authentication + training capability
router.use(authenticate, requireCapability('canViewTraining'));

const validateModuleCreate = [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('description').optional().trim(),
  body('orderIndex').optional().isInt({ min: 0 }),
  body('estimatedTimeMinutes').optional().isInt({ min: 0 }),
  body('isActive').optional().isBoolean()
];

const validateModuleUpdate = [
  // Allow partial updates (e.g., linking/unlinking a module to a training focus via trackId)
  body('title').optional().trim().notEmpty().withMessage('Title is required'),
  body('description').optional().trim(),
  body('orderIndex').optional().isInt({ min: 0 }),
  body('estimatedTimeMinutes').optional().isInt({ min: 0 }),
  body('isActive').optional().isBoolean()
];

router.get('/', getAllModules);
router.get('/shared', getSharedModules);
router.get('/archived', requireBackofficeAdmin, getArchivedModules); // Must come before /:id
router.get('/:moduleId/responses', getResponses);
router.get('/:moduleId/form-definition', getModuleFormDefinition);
router.post('/:moduleId/form-upload', uploadModuleFormFile);
router.get('/:id', getModuleById);
router.get('/:id/copy-preview', requireBackofficeAdmin, getCopyPreview);
router.post('/', requireBackofficeAdmin, validateModuleCreate, createModule);
router.post('/shared', requireSuperAdmin, validateModuleCreate, createSharedModule);
router.post('/:id/copy', requireBackofficeAdmin, [
  body('targetAgencyId').optional().isInt(),
  body('targetTrackId').optional().isInt()
], copyModule);
router.put('/:id', requireBackofficeAdmin, validateModuleUpdate, updateModule);
router.post('/:moduleId/form-submit', [
  body('values').isArray().withMessage('Values must be an array'),
  body('values.*.fieldDefinitionId').isInt({ min: 1 }).withMessage('fieldDefinitionId must be an integer'),
  body('values.*.value').optional()
], submitModuleForm);
router.post('/:id/archive', requireBackofficeAdmin, archiveModule);
router.post('/:id/restore', requireBackofficeAdmin, restoreModule);
router.delete('/:id', requireBackofficeAdmin, deleteModule);
router.post('/:id/assign', requireBackofficeAdmin, [
  body('userIds').optional().isArray().withMessage('User IDs must be an array'),
  body('userIds.*').optional().isInt().withMessage('Each user ID must be an integer'),
  body('agencyId').optional().isInt().withMessage('Agency ID must be an integer'),
  body('role').optional().isIn(['super_admin', 'admin', 'support', 'supervisor', 'clinical_practice_assistant', 'staff', 'provider', 'school_staff', 'facilitator', 'intern']).withMessage('Invalid role'),
  body('dueDate').optional().isISO8601().withMessage('Due date must be a valid ISO 8601 date'),
  body('title').optional().trim(),
  body('description').optional().trim()
], assignModuleToUsers);
router.post('/:moduleId/responses', [
  body('contentId').isInt({ min: 1 }).withMessage('Content ID is required'),
  body('responseText').trim().notEmpty().withMessage('Response text is required')
], saveResponse);

export default router;

