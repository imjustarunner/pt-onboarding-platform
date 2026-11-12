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
import { removeFailedCommunications } from '../controllers/communicationFailureQueue.controller.js';

const router = express.Router();

// Authenticate only matched routes: this router is mounted at /api.

// Get all communications for a user
router.get('/users/:userId/communications', authenticate, getUserCommunications);

// Get single communication
router.get('/users/:userId/communications/:id', authenticate, getCommunication);

// Regenerate email from template
router.post('/users/:userId/communications/:id/regenerate', authenticate, regenerateEmail);

// Platform communications (pending/approval)
router.get('/communications/pending-count', authenticate, getPendingCommunicationsCount);
router.get('/communications/categories', authenticate, listCommunicationCategories);
router.get('/communications/pending', authenticate, listPendingCommunications);
router.post('/communications/resolve-quality-bulk', authenticate, resolveCommunicationsQualityBulk);
router.post('/communications/remove-failed', authenticate, removeFailedCommunications);
router.get('/communications/:id/detail', authenticate, getCommunicationDetail);
// This router mounts before the unified inbox. Static paths such as /prefs
// must reach their own handlers instead of being mistaken for a draft ID.
router.patch('/communications/:id(\\d+)', authenticate, updateCommunicationDraft);
router.post('/communications/:id/approve', authenticate, approveCommunication);
router.post('/communications/:id/cancel', authenticate, cancelCommunication);
router.post('/communications/:id/resolve-quality', authenticate, resolveCommunicationQuality);
router.post('/communications/:id/retry-send', authenticate, retryCommunicationSend);

export default router;
