import express from 'express';
import { body } from 'express-validator';
import { getUserProgress, startModule, completeModule, logTime } from '../controllers/progress.controller.js';
import { authenticate, requireCapability } from '../middleware/auth.middleware.js';
import { requireTrainingModuleAccess } from '../middleware/trainingModuleAccess.middleware.js';
import { requirePassingTrainingQuiz } from '../middleware/trainingCompletion.middleware.js';

const router = express.Router();

const validateTimeLog = [
  body('moduleId').isInt({ min: 1 }),
  body('sessionStart').isISO8601(),
  body('sessionEnd').optional().isISO8601(),
  body('durationSeconds').optional().isInt({ min: 0 }),
  body('durationMinutes').optional().isInt({ min: 0 })
];

router.get('/', authenticate, getUserProgress);
router.post('/start', authenticate, requireCapability('canViewTraining'), requireTrainingModuleAccess, startModule);
router.post('/complete', authenticate, requireCapability('canViewTraining'), requireTrainingModuleAccess, requirePassingTrainingQuiz, completeModule);
router.post('/time', authenticate, requireCapability('canViewTraining'), requireTrainingModuleAccess, validateTimeLog, logTime);

export default router;
