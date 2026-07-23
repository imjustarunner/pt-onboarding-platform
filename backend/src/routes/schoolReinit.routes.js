import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as ctrl from '../controllers/schoolReinit.controller.js';

const router = express.Router();

// Agency admin
router.get('/report', authenticate, ctrl.getReport);
router.get('/campaign', authenticate, ctrl.getCampaignStatus);
router.post('/campaign/enable', authenticate, ctrl.enableCampaign);
router.post('/campaign/push', authenticate, ctrl.pushCampaign);
router.post('/tokens', authenticate, ctrl.generateToken);
router.get('/schools/:schoolOrganizationId', authenticate, ctrl.getSchoolBundle);
router.patch('/tokens/:tokenId/mark-sent', authenticate, ctrl.markTokenSent);
router.get('/questions', authenticate, ctrl.getQuestions);
router.put('/questions/:questionKey', authenticate, ctrl.updateQuestion);
router.post('/questions/reset', authenticate, ctrl.resetQuestions);
router.get('/cycles/:cycleId', authenticate, ctrl.getCycleDetail);
router.post('/change-requests/:id/resolve', authenticate, ctrl.resolveChangeRequest);
router.get('/checkin-slots', authenticate, ctrl.listCheckinSlotsAdmin);
router.post('/checkin-slots', authenticate, ctrl.createCheckinSlot);

// School staff
router.get('/me', authenticate, ctrl.getMyCycle);
router.post('/me/ensure-token', authenticate, ctrl.ensureMyToken);
router.post('/me/dismiss', authenticate, ctrl.dismissMyCycle);
router.put('/me/sections/:sectionKey', authenticate, ctrl.updateMySection);
router.post('/me/change-requests', authenticate, ctrl.submitMyChangeRequest);
router.post('/me/finalize', authenticate, ctrl.finalizeMyCycle);
router.post('/me/addendums', authenticate, ctrl.createMyAddendum);

export default router;
