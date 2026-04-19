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
  listSplashes,
  createSplash,
  updateSplash,
  deleteSplash,
  pauseSplashAtSchool,
  uploadSplashFlier,
  deleteSplashFlier,
  listActiveForPortal,
  dismissSplash
} from '../controllers/agencyMarketingSplash.controller.js';

export const managerRouter = express.Router();
managerRouter.use(authenticate);

managerRouter.get(
  '/agencies/:agencyId/destination-options',
  listDestinationOptions
);
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
