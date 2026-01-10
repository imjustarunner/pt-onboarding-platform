import express from 'express';
import { body } from 'express-validator';
import { submitQuiz, getQuizAttempts } from '../controllers/quiz.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

const validateQuizSubmission = [
  body('answers').isArray().withMessage('Answers must be an array'),
  body('answers.*').notEmpty().withMessage('All answers are required')
];

router.post('/:moduleId/submit', authenticate, validateQuizSubmission, submitQuiz);
router.get('/:moduleId/attempts', authenticate, getQuizAttempts);

export default router;

