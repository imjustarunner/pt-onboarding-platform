import express from 'express';
import {
  getUnifiedChecklist,
  getCustomChecklist,
  assignItemToUser,
  markItemComplete,
  markItemIncomplete
} from '../controllers/userChecklistAssignment.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/users/:userId/unified-checklist', authenticate, getUnifiedChecklist);
router.get('/users/:userId/custom-checklist', authenticate, getCustomChecklist);
router.post('/users/:userId/custom-checklist/:itemId/assign', authenticate, assignItemToUser);
router.post('/users/:userId/custom-checklist/:itemId/complete', authenticate, markItemComplete);
router.post('/users/:userId/custom-checklist/:itemId/incomplete', authenticate, markItemIncomplete);

export default router;

