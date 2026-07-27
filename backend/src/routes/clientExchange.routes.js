import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as ctrl from '../controllers/clientExchange.controller.js';

const router = express.Router();

router.get('/listings', authenticate, ctrl.listListings);
router.post('/listings', authenticate, ctrl.createListing);
router.get('/listings/:id', authenticate, ctrl.getListing);
router.post('/listings/:id/withdraw', authenticate, ctrl.withdrawListing);
router.post('/listings/:id/requests', authenticate, ctrl.createRequest);

router.get('/my-requests', authenticate, ctrl.listMyRequests);
router.post('/requests/:id/approve', authenticate, ctrl.approveRequest);
router.post('/requests/:id/deny', authenticate, ctrl.denyRequest);

router.get('/pending-office-clients', authenticate, ctrl.listPendingOfficeClients);
router.get('/acceptance-metrics', authenticate, ctrl.getAcceptanceMetrics);

export default router;
