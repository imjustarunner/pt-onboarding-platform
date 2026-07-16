import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { agentLimiter } from '../middleware/rateLimiter.middleware.js';
import {
  assist,
  getCapabilities,
  submitAssistFeedback,
  getAssistReviewPendingCount,
  listAssistReviewSignals,
  patchAssistReviewSignal
} from '../controllers/agents.controller.js';

const router = express.Router();

router.post('/assist', authenticate, agentLimiter, assist);
router.post('/assist/feedback', authenticate, agentLimiter, submitAssistFeedback);
router.get('/capabilities', authenticate, agentLimiter, getCapabilities);

// SuperAdmin Ask Assistant training review (role checked in controller)
router.get('/assist/review/pending-count', authenticate, getAssistReviewPendingCount);
router.get('/assist/review', authenticate, listAssistReviewSignals);
router.patch('/assist/review/:id', authenticate, patchAssistReviewSignal);

export default router;

