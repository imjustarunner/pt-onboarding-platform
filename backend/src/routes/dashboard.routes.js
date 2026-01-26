import express from 'express';
import { authenticate, requireAgencyAccess, requireBackofficeAdmin } from '../middleware/auth.middleware.js';
import { getAgencySpecs } from '../controllers/dashboard.controller.js';
import { getSchoolOverview } from '../controllers/schoolOverview.controller.js';

const router = express.Router();

// At-a-glance dashboard metrics (admin dashboards)
router.get('/agency-specs', authenticate, requireBackofficeAdmin, getAgencySpecs);

// School overview (admin/staff dashboards)
router.get('/school-overview', authenticate, requireAgencyAccess, getSchoolOverview);

export default router;

