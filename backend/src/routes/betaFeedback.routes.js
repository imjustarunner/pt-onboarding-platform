import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  submitBetaFeedback,
  listBetaFeedback,
  getBetaFeedback,
  getPendingCount,
  listMyBetaFeedback,
  updateBetaFeedback,
  deleteBetaFeedback,
  bulkDeleteBetaFeedback,
  deleteResolvedBetaFeedback,
  listBetaFeedbackMessages,
  createBetaFeedbackMessage
} from '../controllers/betaFeedback.controller.js';

const router = express.Router();

// Submit feedback (authenticated, beta must be enabled - checked in controller)
router.post('/', authenticate, submitBetaFeedback);

// Pending count (super admin only) - must be before /:id
router.get('/pending-count', authenticate, getPendingCount);
router.get('/mine', authenticate, listMyBetaFeedback);
router.post('/bulk-delete', authenticate, bulkDeleteBetaFeedback);
router.post('/delete-resolved', authenticate, deleteResolvedBetaFeedback);
router.get('/:id/messages', authenticate, listBetaFeedbackMessages);
router.post('/:id/messages', authenticate, createBetaFeedbackMessage);

// List and get (super admin only - checked in controller)
router.get('/', authenticate, listBetaFeedback);
router.get('/:id', authenticate, getBetaFeedback);
router.patch('/:id', authenticate, updateBetaFeedback);
router.delete('/:id', authenticate, deleteBetaFeedback);

export default router;
