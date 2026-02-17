import express from 'express';
import { body } from 'express-validator';
import {
  getTask,
  getUserTasks,
  getTaskCounts,
  assignTask,
  bulkAssignTasks,
  completeTask,
  overrideTask,
  updateDueDate,
  sendReminder,
  getAllTasks,
  deleteTask,
  renderTaskDocumentHtml
} from '../controllers/task.controller.js';
import { authenticate, requireBackofficeAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

const validateTaskAssignment = [
  body('taskType').isIn(['training', 'document']).withMessage('Task type must be training or document'),
  body('title').notEmpty().withMessage('Title is required'),
  body('referenceId').optional().isInt().withMessage('Reference ID must be an integer'),
  body('assignedToUserId').optional().isInt().withMessage('Assigned user ID must be an integer'),
  body('assignedToRole').optional().isIn(['super_admin', 'admin', 'support', 'supervisor', 'clinical_practice_assistant', 'provider_plus', 'staff', 'provider', 'school_staff', 'facilitator', 'intern']),
  body('assignedToAgencyId').optional().isInt().withMessage('Assigned agency ID must be an integer'),
  body('dueDate').optional().isISO8601().withMessage('Due date must be a valid ISO 8601 date'),
  body('documentActionType').optional().isIn(['signature', 'review']).withMessage('Document action type must be signature or review')
];

const validateDueDate = [
  body('dueDate').isISO8601().withMessage('Due date must be a valid ISO 8601 date')
];

// User routes
router.get('/', authenticate, getUserTasks);
router.get('/counts', authenticate, getTaskCounts);
router.put('/:id/complete', authenticate, completeTask);
router.get('/:id/render', authenticate, renderTaskDocumentHtml);

// Admin routes - specific routes must come before parameterized routes
router.get('/all', authenticate, requireBackofficeAdmin, getAllTasks); // Must be before /:id
router.post('/', authenticate, requireBackofficeAdmin, validateTaskAssignment, assignTask);
router.post('/bulk', authenticate, requireBackofficeAdmin, validateTaskAssignment, bulkAssignTasks);
router.put('/:id/override', authenticate, requireBackofficeAdmin, overrideTask);
router.put('/:id/due-date', authenticate, requireBackofficeAdmin, validateDueDate, updateDueDate);
router.post('/:id/reminder', authenticate, requireBackofficeAdmin, sendReminder);
router.delete('/:id', authenticate, requireBackofficeAdmin, deleteTask);

// Parameterized routes (must come after specific routes)
router.get('/:id', authenticate, getTask);

export default router;

