import express from 'express';
import * as ctrl from '../controllers/providerActionOutreach.controller.js';

const router = express.Router();

router.get('/:token', ctrl.getPublicProviderAction);
router.post('/:token/open', ctrl.openPublicProviderAction);
router.post('/:token/session-heartbeat', ctrl.heartbeatPublicProviderAction);
router.get('/:token/clients', ctrl.listPublicClients);
router.get('/:token/clients/:clientId/year-disposition', ctrl.getPublicYearDisposition);
router.put('/:token/clients/:clientId/spring-update', ctrl.putPublicSpringUpdate);
router.put('/:token/clients/:clientId/fall-confirmation', ctrl.putPublicFallConfirmation);
router.put('/:token/clients/:clientId/compliance-checklist', ctrl.putPublicComplianceChecklist);
router.post('/:token/clients/:clientId/assigned-day', ctrl.postPublicAssignedDay);

export default router;
