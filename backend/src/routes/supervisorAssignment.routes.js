import express from 'express';
import { body } from 'express-validator';
import {
  createAssignment,
  deleteAssignment,
  getSupervisees,
  getSupervisors,
  getAgencyAssignments
} from '../controllers/supervisorAssignment.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Create assignment
router.post(
  '/',
  [
    body('supervisorId').isInt().withMessage('supervisorId must be an integer'),
    body('superviseeId').isInt().withMessage('superviseeId must be an integer'),
    body('agencyId').isInt().withMessage('agencyId must be an integer')
  ],
  createAssignment
);

// Delete assignment
router.delete('/:id', deleteAssignment);

// Get supervisees for a supervisor
router.get('/supervisor/:supervisorId', getSupervisees);

// Get supervisors for a supervisee
router.get('/supervisee/:superviseeId', getSupervisors);

// Get all assignments in an agency
router.get('/agency/:agencyId', getAgencyAssignments);

export default router;
