import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  createLearningAssignment,
  createLearningAssignmentSubmission,
  createLearningAssignmentEvaluation
} from '../controllers/learningAssignments.controller.js';

const router = express.Router();
router.use(authenticate);

router.post('/', createLearningAssignment);
router.post('/:assignmentId/submissions', createLearningAssignmentSubmission);
router.post('/:assignmentId/evaluations', createLearningAssignmentEvaluation);

export default router;
