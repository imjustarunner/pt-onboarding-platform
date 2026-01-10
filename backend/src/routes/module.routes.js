import express from 'express';
import { body } from 'express-validator';
import { getAllModules, getModuleById, createModule, updateModule, archiveModule, restoreModule, deleteModule, getArchivedModules, createSharedModule, getSharedModules, copyModule, getCopyPreview, assignModuleToUsers } from '../controllers/module.controller.js';
import { saveResponse, getResponses } from '../controllers/moduleResponse.controller.js';
import { authenticate, requireAdmin, requireSuperAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

const validateModule = [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('description').optional().trim(),
  body('orderIndex').optional().isInt({ min: 0 }),
  body('isActive').optional().isBoolean()
];

router.get('/', authenticate, getAllModules);
router.get('/shared', authenticate, getSharedModules);
router.get('/archived', authenticate, requireAdmin, getArchivedModules); // Must come before /:id
router.get('/:moduleId/responses', authenticate, getResponses);
router.get('/:id', authenticate, getModuleById);
router.get('/:id/copy-preview', authenticate, requireAdmin, getCopyPreview);
router.post('/', authenticate, requireAdmin, validateModule, createModule);
router.post('/shared', authenticate, requireSuperAdmin, validateModule, createSharedModule);
router.post('/:id/copy', authenticate, requireAdmin, [
  body('targetAgencyId').optional().isInt(),
  body('targetTrackId').optional().isInt()
], copyModule);
router.put('/:id', authenticate, requireAdmin, validateModule, updateModule);
router.post('/:id/archive', authenticate, requireAdmin, archiveModule);
router.post('/:id/restore', authenticate, requireAdmin, restoreModule);
router.delete('/:id', authenticate, requireAdmin, deleteModule);
router.post('/:id/assign', authenticate, requireAdmin, [
  body('userIds').optional().isArray().withMessage('User IDs must be an array'),
  body('userIds.*').optional().isInt().withMessage('Each user ID must be an integer'),
  body('agencyId').optional().isInt().withMessage('Agency ID must be an integer'),
  body('role').optional().isIn(['super_admin', 'admin', 'support', 'supervisor', 'clinical_practice_assistant', 'staff', 'clinician', 'facilitator', 'intern']).withMessage('Invalid role'),
  body('dueDate').optional().isISO8601().withMessage('Due date must be a valid ISO 8601 date'),
  body('title').optional().trim(),
  body('description').optional().trim()
], assignModuleToUsers);
router.post('/:moduleId/responses', authenticate, [
  body('contentId').isInt({ min: 1 }).withMessage('Content ID is required'),
  body('responseText').trim().notEmpty().withMessage('Response text is required')
], saveResponse);

export default router;

