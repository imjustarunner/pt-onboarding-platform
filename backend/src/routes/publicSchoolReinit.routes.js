import express from 'express';
import * as ctrl from '../controllers/schoolReinit.controller.js';

const router = express.Router();

router.get('/:token', ctrl.getPublicByToken);
router.put('/:token/sections/:sectionKey', ctrl.updatePublicSection);
router.post('/:token/checkin-bookings', ctrl.bookPublicCheckinSlot);
router.post('/:token/change-requests', ctrl.submitPublicChangeRequest);
router.post('/:token/finalize', ctrl.finalizePublic);
router.post('/:token/addendums', ctrl.createPublicAddendum);

export default router;
