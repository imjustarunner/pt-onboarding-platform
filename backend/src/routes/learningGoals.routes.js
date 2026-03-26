import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  createLearningGoal,
  patchLearningGoal,
  activateLearningGoal,
  archiveLearningGoal,
  listLearningGoalSuggestions
} from '../controllers/learningGoals.controller.js';

const router = express.Router();
router.use(authenticate);

router.post('/', createLearningGoal);
router.patch('/:goalId', patchLearningGoal);
router.post('/:goalId/activate', activateLearningGoal);
router.post('/:goalId/archive', archiveLearningGoal);
router.get('/students/:studentId/suggestions', listLearningGoalSuggestions);

export default router;
