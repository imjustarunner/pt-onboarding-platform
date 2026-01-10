import express from 'express';
import { body } from 'express-validator';
import {
  getAllPackages,
  getPackageById,
  createPackage,
  updatePackage,
  deletePackage,
  addTrainingFocusToPackage,
  removeTrainingFocusFromPackage,
  addModuleToPackage,
  removeModuleFromPackage,
  addDocumentToPackage,
  removeDocumentFromPackage,
  addChecklistItemToPackage,
  removeChecklistItemFromPackage,
  assignPackage
} from '../controllers/onboardingPackage.controller.js';
import { authenticate, requireAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

const validatePackage = [
  body('name').trim().notEmpty().withMessage('Package name is required'),
  body('name').isLength({ min: 1, max: 255 }).withMessage('Package name must be between 1 and 255 characters'),
  body('description').optional().trim(),
  body('agencyId').optional().custom((value) => {
    if (value === null || value === undefined || value === '') {
      return true; // Allow null for platform-wide packages
    }
    return Number.isInteger(Number(value)) && Number(value) > 0;
  }).withMessage('Agency ID must be a positive integer or null'),
  body('isActive').optional().isBoolean()
];

router.get('/', authenticate, requireAdmin, getAllPackages);
router.get('/:id', authenticate, requireAdmin, getPackageById);
router.post('/', authenticate, requireAdmin, validatePackage, createPackage);
router.put('/:id', authenticate, requireAdmin, validatePackage, updatePackage);
router.delete('/:id', authenticate, requireAdmin, deletePackage);

// Training Focus management
router.post('/:id/training-focuses', authenticate, requireAdmin, [
  body('trackId').isInt({ min: 1 }).withMessage('Track ID is required'),
  body('orderIndex').optional().isInt({ min: 0 })
], addTrainingFocusToPackage);
router.delete('/:id/training-focuses/:trackId', authenticate, requireAdmin, removeTrainingFocusFromPackage);

// Module management
router.post('/:id/modules', authenticate, requireAdmin, [
  body('moduleId').isInt({ min: 1 }).withMessage('Module ID is required'),
  body('orderIndex').optional().isInt({ min: 0 })
], addModuleToPackage);
router.delete('/:id/modules/:moduleId', authenticate, requireAdmin, removeModuleFromPackage);

// Document management
router.post('/:id/documents', authenticate, requireAdmin, [
  body('documentTemplateId').isInt({ min: 1 }).withMessage('Document template ID is required'),
  body('orderIndex').optional().isInt({ min: 0 }),
  body('actionType').optional().isIn(['signature', 'review']),
  body('dueDateDays').optional().isInt({ min: 0 })
], addDocumentToPackage);
router.delete('/:id/documents/:documentTemplateId', authenticate, requireAdmin, removeDocumentFromPackage);

// Checklist Item management
router.post('/:id/checklist-items', authenticate, requireAdmin, [
  body('checklistItemId').isInt({ min: 1 }).withMessage('Checklist item ID is required'),
  body('orderIndex').optional().isInt({ min: 0 })
], addChecklistItemToPackage);
router.delete('/:id/checklist-items/:checklistItemId', authenticate, requireAdmin, removeChecklistItemFromPackage);

// Assign package
router.post('/:id/assign', authenticate, requireAdmin, [
  body('userIds').isArray().withMessage('User IDs must be an array'),
  body('userIds.*').isInt({ min: 1 }).withMessage('Each user ID must be a positive integer'),
  body('agencyId').isInt({ min: 1 }).withMessage('Agency ID is required and must be a positive integer'),
  body('dueDate').optional().isISO8601().withMessage('Due date must be a valid ISO 8601 date')
], assignPackage);

export default router;

