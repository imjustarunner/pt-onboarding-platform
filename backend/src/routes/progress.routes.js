import express from 'express';
import { body } from 'express-validator';
import { getUserProgress, startModule, completeModule, logTime } from '../controllers/progress.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

const validateTimeLog = [
  body('moduleId').isInt({ min: 1 }),
  body('sessionStart').isISO8601(),
  body('sessionEnd').optional().isISO8601(),
  body('durationMinutes').isInt({ min: 0 })
];

router.get('/', authenticate, getUserProgress);
router.post('/start', authenticate, startModule);
router.post('/complete', authenticate, completeModule);
router.post('/time', authenticate, validateTimeLog, logTime);

export default router;

