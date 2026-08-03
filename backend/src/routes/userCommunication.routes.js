import express from 'express';
import {
  getUserCommunications,
  getCommunication,
  regenerateEmail,
  getPendingCommunicationsCount,
  listPendingCommunications,
  listCommunicationCategories,
  getCommunicationDetail,
  approveCommunication,
  cancelCommunication,
  updateCommunicationDraft,
  resolveCommunicationQuality,
  resolveCommunicationsQualityBulk,
  retryCommunicationSend
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
router.get('/communications/categories', listCommunicationCategories);
router.get('/communications/pending', listPendingCommunications);
router.post('/communications/resolve-quality-bulk', resolveCommunicationsQualityBulk);
router.get('/communications/:id/detail', getCommunicationDetail);
router.patch('/communications/:id', updateCommunicationDraft);
router.post('/communications/:id/approve', approveCommunication);
router.post('/communications/:id/cancel', cancelCommunication);
router.post('/communications/:id/resolve-quality', resolveCommunicationQuality);
router.post('/communications/:id/retry-send', retryCommunicationSend);

export default router;
