import express from 'express';
import {
  getUserActivityLog,
  getActivitySummary,
  getModuleTimeBreakdown,
  getAgencyActivityLog,
  exportAgencyActivityLogCsv
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

// Agency audit-center activity log endpoints (read-only)
router.get('/agency/:agencyId', getAgencyActivityLog);
router.get('/agency/:agencyId/export.csv', exportAgencyActivityLogCsv);

export default router;
