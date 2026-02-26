import express from 'express';
import {
  getUserCommunications,
  getCommunication,
  regenerateEmail,
  getPendingCommunicationsCount,
  listPendingCommunications,
  approveCommunication,
  cancelCommunication
} from '../controllers/userCommunication.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get all communications for a user
router.get('/users/:userId/communications', getUserCommunications);

// Get single communication
router.get('/users/:userId/communications/:id', getCommunication);

// Regenerate email from template
router.post('/users/:userId/communications/:id/regenerate', regenerateEmail);

// Platform communications (pending/approval)
router.get('/communications/pending-count', getPendingCommunicationsCount);
router.get('/communications/pending', listPendingCommunications);
router.post('/communications/:id/approve', approveCommunication);
router.post('/communications/:id/cancel', cancelCommunication);

export default router;
