import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as ctrl from '../controllers/officeClientManagement.controller.js';

const router = express.Router();

router.get('/', authenticate, ctrl.listOfficeClients);
router.get('/hub-summary', authenticate, ctrl.getOfficeHubSummary);
router.get('/units', authenticate, ctrl.listOfficeTherapyUnits);
router.get('/providers', authenticate, ctrl.listOfficeHubProviders);
router.put('/:id/waitlist', authenticate, ctrl.putOfficeClientWaitlist);

export default router;
