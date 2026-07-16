import express from 'express';
import { authenticate, requireAgencyAccess } from '../middleware/auth.middleware.js';
import {
  getSummary,
  getProviders,
  getWarnings,
  getOpenDays,
  getSchool,
  getProvider,
  listHubEvents,
  getSuggestions,
  expireStaleRequests
} from '../controllers/schoolCoverage.controller.js';

const router = express.Router();

router.get('/summary', authenticate, requireAgencyAccess, getSummary);
router.get('/providers', authenticate, requireAgencyAccess, getProviders);
router.get('/warnings', authenticate, requireAgencyAccess, getWarnings);
router.get('/open-days', authenticate, requireAgencyAccess, getOpenDays);
router.get('/schools/:schoolId/detail', authenticate, requireAgencyAccess, getSchool);
router.get('/providers/:providerId/detail', authenticate, requireAgencyAccess, getProvider);
router.get('/events', authenticate, requireAgencyAccess, listHubEvents);
router.get('/suggestions', authenticate, requireAgencyAccess, getSuggestions);
router.post('/expire-stale-requests', authenticate, requireAgencyAccess, expireStaleRequests);

export default router;
