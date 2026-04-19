/**
 * Agency-owned school-portal marketing campaigns.
 * Mounted twice in server.js:
 *   /api/agency-marketing-splashes  → manager surface (admin/support/super_admin)
 *   /api/school-portal              → portal-side fetch + dismiss
 */
import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listDestinationOptions,
  listTenantOptions,
  listSplashes,
  createSplash,
  updateSplash,
  deleteSplash,
  pauseSplashAtSchool,
  uploadSplashFlier,
  deleteSplashFlier,
  listActiveForPortal,
  listActiveForDashboard,
  dismissSplash
} from '../controllers/agencyMarketingSplash.controller.js';

export const managerRouter = express.Router();
managerRouter.use(authenticate);

managerRouter.get(
  '/agencies/:agencyId/destination-options',
  listDestinationOptions
);
managerRouter.get('/agencies/:agencyId/tenant-options', listTenantOptions);
managerRouter.get('/agencies/:agencyId', listSplashes);
managerRouter.post('/agencies/:agencyId', createSplash);
managerRouter.patch('/agencies/:agencyId/:id', updateSplash);
managerRouter.delete('/agencies/:agencyId/:id', deleteSplash);
managerRouter.post(
  '/agencies/:agencyId/:id/schools/:schoolId/pause',
  pauseSplashAtSchool
);
managerRouter.post('/agencies/:agencyId/:id/flier', uploadSplashFlier);
managerRouter.delete('/agencies/:agencyId/:id/flier', deleteSplashFlier);

export const portalRouter = express.Router();
portalRouter.use(authenticate);
portalRouter.get('/marketing-splashes/active', listActiveForPortal);
portalRouter.post('/marketing-splashes/:id/dismiss', dismissSplash);

// Dashboard mount (regular staff/provider dashboard) — separate path so the
// audience filter rules differ.
export const dashboardRouter = express.Router();
dashboardRouter.use(authenticate);
dashboardRouter.get('/dashboard-active', listActiveForDashboard);
dashboardRouter.post('/:id/dismiss', dismissSplash);
