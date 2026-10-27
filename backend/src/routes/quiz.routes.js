import { requireTrainingModuleAccess } from '../middleware/trainingModuleAccess.middleware.js';
import express from 'express';
import { body } from 'express-validator';
import { submitQuiz, getQuizAttempts } from '../controllers/quiz.controller.js';
import { authenticate, requireCapability } from '../middleware/auth.middleware.js';

const router = express.Router();
router.use(authenticate, requireCapability('canViewTraining'));
router.param('moduleId', requireTrainingModuleAccess);

const validateQuizSubmission = [
  body('answers').isArray().withMessage('Answers must be an array'),
  body('answers.*').notEmpty().withMessage('All answers are required')
];

router.post('/:moduleId/submit', validateQuizSubmission, submitQuiz);
router.get('/:moduleId/attempts', getQuizAttempts);

export default router;

