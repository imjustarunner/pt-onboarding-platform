import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  submitBetaFeedback,
  listBetaFeedback,
  getBetaFeedback,
  getPendingCount,
  updateBetaFeedback
} from '../controllers/betaFeedback.controller.js';

const router = express.Router();

// Submit feedback (authenticated, beta must be enabled - checked in controller)
router.post('/', authenticate, submitBetaFeedback);

// Pending count (super admin only) - must be before /:id
router.get('/pending-count', authenticate, getPendingCount);

// List and get (super admin only - checked in controller)
router.get('/', authenticate, listBetaFeedback);
router.get('/:id', authenticate, getBetaFeedback);
router.patch('/:id', authenticate, updateBetaFeedback);

export default router;
