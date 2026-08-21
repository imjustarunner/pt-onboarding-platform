import express from 'express';
import * as ctrl from '../controllers/providerUpdate.controller.js';
import * as hb from '../controllers/workplaceHandbook.controller.js';

const router = express.Router();

router.get('/:token', ctrl.getPublicByToken);
router.post('/:token/session-heartbeat', ctrl.heartbeatPublic);
router.put('/:token/sections/:sectionKey', ctrl.updatePublicSection);
router.post('/:token/finalize', ctrl.finalizePublic);
router.get('/:token/office-schedule-review', ctrl.officeSchedulePublic);
router.get('/:token/admin-update-latest', ctrl.latestAdminUpdatePublic);
router.get('/:token/fall-actions', ctrl.fallActionsPublic);

router.get('/:token/handbook', hb.publicPublishedByToken);
router.post('/:token/handbook/views', hb.publicTrackByToken);
router.post('/:token/handbook/questions', hb.publicAskByToken);

export default router;
