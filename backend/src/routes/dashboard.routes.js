import express from 'express';
import { authenticate, requireAgencyAccess, requireBackofficeAdmin, requireSuperAdmin } from '../middleware/auth.middleware.js';
import { requireAgencyAccess as tenantAccess } from '../middleware/agencyAccess.middleware.js';
import { getAgencySpecs, getOrgOverviewSummary, getScheduleSnapshot, getPlatformTenantSummary } from '../controllers/dashboard.controller.js';
import {
  getSchoolOverview,
  listSchoolInternalNotes,
  createSchoolInternalNote
} from '../controllers/schoolOverview.controller.js';
import { listForDashboard } from '../controllers/socialFeedLinks.controller.js';

const router = express.Router();

// At-a-glance dashboard metrics (admin dashboards) - tenant scoped via agencyAccess middleware
router.get('/agency-specs', authenticate, tenantAccess, requireBackofficeAdmin, getAgencySpecs);

// Schedule snapshot for tenant admin dashboard (today's real sessions)
router.get('/schedule-snapshot', authenticate, tenantAccess, requireBackofficeAdmin, getScheduleSnapshot);

// Platform-level tenant summary (super admin only - all tenants with real metrics)
router.get('/platform-tenant-summary', authenticate, requireSuperAdmin, getPlatformTenantSummary);

// Lightweight affiliated org counts (admin dashboards)
router.get('/org-overview-summary', authenticate, requireAgencyAccess, getOrgOverviewSummary);

// School overview (admin/staff dashboards)
router.get('/school-overview', authenticate, requireAgencyAccess, getSchoolOverview);

// School org internal notes (admin / super_admin / CPA only — enforced in controller)
router.get(
  '/school-overview/:schoolOrganizationId/internal-notes',
  authenticate,
  requireAgencyAccess,
  listSchoolInternalNotes
);
router.post(
  '/school-overview/:schoolOrganizationId/internal-notes',
  authenticate,
  requireAgencyAccess,
  createSchoolInternalNote
);

// Social feeds for My Dashboard (agency + optional org/program scope)
router.get('/social-feeds', authenticate, listForDashboard);

export default router;

