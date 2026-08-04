import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as ctrl from '../controllers/providerYearUpdate.controller.js';

const router = express.Router();

router.get('/report', authenticate, ctrl.getReport);
router.get('/campaign', authenticate, ctrl.getCampaignStatus);
router.post('/campaign/enable', authenticate, ctrl.enableCampaign);
router.post('/campaign/disable', authenticate, ctrl.disableCampaign);
router.post('/campaign/push', authenticate, ctrl.pushCampaign);
router.post('/tokens', authenticate, ctrl.generateToken);
router.patch('/tokens/:tokenId/mark-sent', authenticate, ctrl.markTokenSent);
router.post('/providers/:providerUserId/push', authenticate, ctrl.pushProvider);
router.post('/providers/:providerUserId/mark-complete', authenticate, ctrl.adminMarkComplete);
router.get('/providers/:providerUserId', authenticate, ctrl.getProviderBundle);

router.get('/school-needs/schools', authenticate, ctrl.listSchoolNeedsSchools);
router.get('/school-needs', authenticate, ctrl.listSchoolNeedsAdmin);
router.post('/school-needs', authenticate, ctrl.createSchoolNeed);
router.patch('/school-needs/applications/:id', authenticate, ctrl.reviewSchoolNeedApplication);
router.get('/school-needs/:id/applications', authenticate, ctrl.listSchoolNeedApplications);
router.patch('/school-needs/:id', authenticate, ctrl.updateSchoolNeed);

router.get('/me', authenticate, ctrl.getMyCycle);
router.get('/me/status', authenticate, ctrl.getMyStatus);
router.post('/me/ensure-token', authenticate, ctrl.ensureMyToken);
router.post('/me/dismiss', authenticate, ctrl.dismissMyCycle);
router.put('/me/sections/:sectionKey', authenticate, ctrl.updateMySection);
router.post('/me/finalize', authenticate, ctrl.finalizeMyCycle);
router.post('/me/session-heartbeat', authenticate, ctrl.heartbeatMyCycle);
router.get('/me/school-needs', authenticate, ctrl.listMySchoolNeeds);
router.post('/me/school-needs/:id/apply', authenticate, ctrl.applyMySchoolNeed);
router.delete('/me/school-needs/:id/apply', authenticate, ctrl.withdrawMySchoolNeed);

export default router;
