import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as ctrl from '../controllers/providerYearUpdate.controller.js';

const router = express.Router();

router.get('/report', authenticate, ctrl.getReport);
router.get('/campaign', authenticate, ctrl.getCampaignStatus);
router.post('/campaign/enable', authenticate, ctrl.enableCampaign);
router.post('/campaign/push', authenticate, ctrl.pushCampaign);
router.post('/tokens', authenticate, ctrl.generateToken);
router.patch('/tokens/:tokenId/mark-sent', authenticate, ctrl.markTokenSent);
router.post('/providers/:providerUserId/push', authenticate, ctrl.pushProvider);
router.get('/providers/:providerUserId', authenticate, ctrl.getProviderBundle);

router.get('/me', authenticate, ctrl.getMyCycle);
router.get('/me/status', authenticate, ctrl.getMyStatus);
router.post('/me/ensure-token', authenticate, ctrl.ensureMyToken);
router.post('/me/dismiss', authenticate, ctrl.dismissMyCycle);
router.put('/me/sections/:sectionKey', authenticate, ctrl.updateMySection);
router.post('/me/finalize', authenticate, ctrl.finalizeMyCycle);

export default router;
