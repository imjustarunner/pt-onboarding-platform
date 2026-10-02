import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as ctrl from '../controllers/clientExchange.controller.js';

const router = express.Router();
router.use(authenticate, (req, res, next) => {
  if (!['admin', 'super_admin', 'support', 'staff', 'provider', 'provider_plus', 'intern', 'intern_plus', 'supervisor', 'clinical_practice_assistant'].includes(req.user?.role)) return res.status(403).json({ error: { message: 'Provider or agency staff access required' } });
  next();
});
router.post('/referrals', ctrl.createReferral);

router.get('/clients/:clientId/summary', authenticate, ctrl.previewClientSummary);
router.put('/clients/:clientId/schedule', authenticate, ctrl.saveClientSchedule);
router.get('/providers', authenticate, ctrl.listReferralProviders);
router.get('/listings', authenticate, ctrl.listListings);
router.post('/listings', authenticate, ctrl.createListing);
router.get('/listings/:id', authenticate, ctrl.getListing);
router.post('/listings/:id/withdraw', authenticate, ctrl.withdrawListing);
router.post('/listings/:id/requests', authenticate, ctrl.createRequest);

router.get('/my-requests', authenticate, ctrl.listMyRequests);
router.post('/requests/:id/approve', authenticate, ctrl.approveRequest);
router.post('/requests/:id/deny', authenticate, ctrl.denyRequest);

router.get('/pending-office-clients', authenticate, ctrl.listPendingOfficeClients);
router.get('/recently-referred', authenticate, ctrl.listRecentlyReferredClients);
router.get('/acceptance-metrics', authenticate, ctrl.getAcceptanceMetrics);
router.post('/adaptive-convert', authenticate, async (req, res, next) => {
  const { convertProspective } = await import('../controllers/adaptiveIntake.controller.js');
  return convertProspective(req, res, next);
});
router.get('/adaptive-templates', authenticate, async (req, res, next) => {
  const { getPathwayTemplates } = await import('../controllers/adaptiveIntake.controller.js');
  return getPathwayTemplates(req, res, next);
});
router.post('/adaptive-bootstrap-frame', authenticate, async (req, res, next) => {
  const { bootstrapPractitionerFrame } = await import('../controllers/adaptiveIntake.controller.js');
  return bootstrapPractitionerFrame(req, res, next);
});

export default router;
