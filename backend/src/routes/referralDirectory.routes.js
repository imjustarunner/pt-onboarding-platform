import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listEntries,
  createEntry,
  updateEntry,
  deleteEntry,
  listChangeRequests,
  pendingChangeRequestsCount,
  approveChangeRequest,
  rejectChangeRequest
} from '../controllers/referralDirectory.controller.js';

const router = express.Router();

// Categories
router.get('/categories', authenticate, listCategories);
router.post('/categories', authenticate, createCategory);
router.put('/categories/:id', authenticate, updateCategory);
router.delete('/categories/:id', authenticate, deleteCategory);

// Entries
router.get('/entries', authenticate, listEntries);
router.post('/entries', authenticate, createEntry);
router.put('/entries/:id', authenticate, updateEntry);
router.delete('/entries/:id', authenticate, deleteEntry);

// Change-request approval queue (admins only inside the controller).
router.get('/change-requests', authenticate, listChangeRequests);
router.get('/change-requests/pending-count', authenticate, pendingChangeRequestsCount);
router.post('/change-requests/:id/approve', authenticate, approveChangeRequest);
router.post('/change-requests/:id/reject', authenticate, rejectChangeRequest);

export default router;
