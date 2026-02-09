import express from 'express';
import { authenticate, requireAgencyAccess, requireBackofficeAdmin } from '../middleware/auth.middleware.js';
import { getAgencySpecs, getOrgOverviewSummary } from '../controllers/dashboard.controller.js';
import { getSchoolOverview } from '../controllers/schoolOverview.controller.js';
import { listForDashboard } from '../controllers/socialFeedLinks.controller.js';

const router = express.Router();

// At-a-glance dashboard metrics (admin dashboards)
router.get('/agency-specs', authenticate, requireBackofficeAdmin, getAgencySpecs);

// Lightweight affiliated org counts (admin dashboards)
router.get('/org-overview-summary', authenticate, requireAgencyAccess, getOrgOverviewSummary);

// School overview (admin/staff dashboards)
router.get('/school-overview', authenticate, requireAgencyAccess, getSchoolOverview);

// Social feeds for My Dashboard (agency + optional org/program scope)
router.get('/social-feeds', authenticate, listForDashboard);

export default router;

