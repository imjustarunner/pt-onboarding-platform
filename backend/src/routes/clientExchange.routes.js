import { requireExchangeAccess } from '../middleware/clientExchangeAccess.middleware.js';
import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as ctrl from '../controllers/clientExchange.controller.js';

const router = express.Router();
router.use(authenticate, requireExchangeAccess);
router.post('/referrals', ctrl.createReferral);

router.get('/clients/:clientId/summary', ctrl.previewClientSummary);
router.put('/clients/:clientId/schedule', ctrl.saveClientSchedule);
router.put('/clients/:clientId/matching-preferences', ctrl.saveClientMatchingPreferences);
router.get('/providers', ctrl.listReferralProviders);
router.get('/listings', ctrl.listListings);
router.post('/listings', ctrl.createListing);
router.get('/listings/:id/audit', ctrl.getListingAudit);
router.post('/listings/:id/waivers', ctrl.saveMatchingWaiver);
router.post('/listings/:id/shares/preview', ctrl.previewShare);
router.post('/listings/:id/shares', ctrl.shareListing);
router.get('/listings/:id', ctrl.getListing);
router.get('/listings/:id/matching-audit', ctrl.getMatchingAudit);
router.post('/listings/:id/withdraw', ctrl.withdrawListing);
router.post('/listings/:id/requests', ctrl.createRequest);

router.get('/my-requests', ctrl.listMyRequests);
router.post('/requests/:id/approve', ctrl.approveRequest);
router.post('/requests/:id/deny', ctrl.denyRequest);

router.get('/pending-office-clients', ctrl.listPendingOfficeClients);
router.get('/recently-referred', ctrl.listRecentlyReferredClients);
router.get('/acceptance-metrics', ctrl.getAcceptanceMetrics);
router.post('/adaptive-convert', async (req, res, next) => {
  const { convertProspective } = await import('../controllers/adaptiveIntake.controller.js');
  return convertProspective(req, res, next);
});
router.get('/adaptive-templates', async (req, res, next) => {
  const { getPathwayTemplates } = await import('../controllers/adaptiveIntake.controller.js');
  return getPathwayTemplates(req, res, next);
});
router.post('/adaptive-bootstrap-frame', async (req, res, next) => {
  const { bootstrapPractitionerFrame } = await import('../controllers/adaptiveIntake.controller.js');
  return bootstrapPractitionerFrame(req, res, next);
});

export default router;
