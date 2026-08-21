import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as ctrl from '../controllers/providerUpdate.controller.js';
import * as hb from '../controllers/workplaceHandbook.controller.js';

const router = express.Router();

router.get('/catalog', authenticate, ctrl.getCatalog);
router.get('/pushes', authenticate, ctrl.listPushesHandler);
router.post('/pushes', authenticate, ctrl.createPushHandler);
router.get('/pushes/:pushId', authenticate, ctrl.getPushHandler);
router.put('/pushes/:pushId', authenticate, ctrl.updatePushHandler);
router.post('/pushes/:pushId/send', authenticate, ctrl.sendPushHandler);
router.get('/pushes/:pushId/export', authenticate, ctrl.exportPushHandler);
router.post('/pushes/:pushId/submit-payroll', authenticate, ctrl.submitPayrollHandler);
router.get('/eligible-providers', authenticate, ctrl.listEligibleProvidersHandler);
router.get('/providers/:providerUserId/fall-actions', authenticate, ctrl.fallActionsForRecipient);
router.get('/me/fall-actions', authenticate, ctrl.fallActionsMine);

router.get('/me', authenticate, ctrl.getMyUpdate);
router.post('/me/session-heartbeat', authenticate, ctrl.heartbeatMyUpdate);
router.put('/me/sections/:sectionKey', authenticate, ctrl.updateMySection);
router.post('/me/finalize', authenticate, ctrl.finalizeMyUpdate);
router.get('/me/office-schedule-review', authenticate, ctrl.officeScheduleMine);
router.get('/me/admin-update-latest', authenticate, ctrl.latestAdminUpdateMine);
router.get('/admin-update-latest', authenticate, ctrl.latestAdminUpdateAdmin);
router.get('/admin-updates', authenticate, ctrl.listAttachableAdminUpdates);
router.post('/admin-updates', authenticate, ctrl.createAttachedAdminUpdate);
router.put('/admin-updates/:updateId', authenticate, ctrl.patchAttachedAdminUpdate);

router.get('/handbook/published', authenticate, hb.getPublished);
router.get('/handbook/draft', authenticate, hb.getDraft);
router.post('/handbook/sections', authenticate, hb.saveSection);
router.put('/handbook/sections/:sectionId', authenticate, hb.saveSection);
router.delete('/handbook/sections/:sectionId', authenticate, hb.removeSection);
router.post('/handbook/publish', authenticate, hb.publish);
router.get('/handbook/questions', authenticate, hb.listQuestions);
router.post('/handbook/views', authenticate, hb.trackView);
router.post('/handbook/questions', authenticate, hb.askQuestion);
router.put('/handbook/full-url', authenticate, hb.saveFullHandbookUrl);
router.get('/handbook/digests', authenticate, hb.listDigestsHandler);
router.post('/handbook/digests', authenticate, hb.createDigestHandler);
router.get('/handbook/digests/:digestId', authenticate, hb.getDigestHandler);
router.put('/handbook/digests/:digestId', authenticate, hb.updateDigestHandler);
router.post('/handbook/digests/:digestId/entries', authenticate, hb.saveDigestEntryHandler);
router.delete('/handbook/digests/:digestId/entries/:entryId', authenticate, hb.deleteDigestEntryHandler);
router.post('/handbook/digests/:digestId/publish', authenticate, hb.publishDigestHandler);

export default router;
