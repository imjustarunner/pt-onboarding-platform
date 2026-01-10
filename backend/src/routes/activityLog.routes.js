import express from 'express';
import {
  getUserActivityLog,
  getActivitySummary,
  getModuleTimeBreakdown
} from '../controllers/activityLog.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get activity log for a user
router.get('/user/:userId', getUserActivityLog);

// Get activity summary for a user
router.get('/user/:userId/summary', getActivitySummary);

// Get module time breakdown for a user
router.get('/user/:userId/modules', getModuleTimeBreakdown);

export default router;
