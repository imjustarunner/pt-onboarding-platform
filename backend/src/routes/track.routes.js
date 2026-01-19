import express from 'express';
import { body } from 'express-validator';
import { getAllTracks, getTrackById, createTrack, updateTrack, addModuleToTrack, removeModuleFromTrack, archiveTrack, restoreTrack, deleteTrack, getArchivedTracks, duplicateTrack, copyTrackToAgency, getTrackTemplates, createTrackTemplate, getTrackCopyPreview, getTrainingFocusModules, assignTrainingFocus, getTrainingFocusCompletion } from '../controllers/track.controller.js';
import { authenticate, requireAdmin, requireSuperAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

const validateTrack = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('description').optional().trim(),
  body('orderIndex').optional().isInt({ min: 0 }),
  body('assignmentLevel').optional().isIn(['platform', 'agency', 'role']),
  body('agencyId').optional().custom((value) => {
    if (value === null || value === undefined || value === '') {
      return true; // Allow null/empty for platform templates
    }
    return Number.isInteger(Number(value)) && Number(value) > 0;
  }).withMessage('Agency ID must be a positive integer or null'),
  body('role').optional().isIn(['admin', 'support', 'supervisor', 'staff', 'provider', 'school_staff', 'clinician', 'facilitator', 'intern']),
  body('isActive').optional().isBoolean()
];

// Support both /tracks and /training-focuses for backward compatibility
router.get('/', authenticate, getAllTracks);
router.get('/templates', authenticate, requireSuperAdmin, getTrackTemplates);
router.get('/archived', authenticate, requireAdmin, getArchivedTracks); // Must come before /:id
router.get('/:id', authenticate, getTrackById);
router.get('/:id/modules', authenticate, getTrainingFocusModules);
router.get('/:id/completion/:userId', authenticate, getTrainingFocusCompletion);
router.get('/:id/copy-preview', authenticate, requireAdmin, getTrackCopyPreview);
router.post('/', authenticate, requireAdmin, validateTrack, createTrack);
router.post('/templates', authenticate, requireSuperAdmin, validateTrack, createTrackTemplate);
router.post('/:id/duplicate', authenticate, requireAdmin, duplicateTrack);
router.post('/:id/copy', authenticate, requireSuperAdmin, copyTrackToAgency);
router.post('/:id/assign', authenticate, requireAdmin, [
  body('userIds').isArray().withMessage('User IDs must be an array'),
  body('userIds.*').isInt({ min: 1 }).withMessage('Each user ID must be a positive integer'),
  body('agencyId').isInt({ min: 1 }).withMessage('Agency ID is required and must be a positive integer'),
  body('dueDate').optional().isISO8601().withMessage('Due date must be a valid ISO 8601 date')
], assignTrainingFocus);
router.put('/:id', authenticate, requireAdmin, validateTrack, updateTrack);
router.post('/:id/modules', authenticate, requireAdmin, body('moduleId').isInt({ min: 1 }), addModuleToTrack);
router.delete('/:id/modules/:moduleId', authenticate, requireAdmin, removeModuleFromTrack);
router.post('/:id/archive', authenticate, requireAdmin, archiveTrack);
router.post('/:id/restore', authenticate, requireAdmin, restoreTrack);
router.delete('/:id', authenticate, requireAdmin, deleteTrack);

export default router;

