import express from 'express';
import { authenticate, requireCapability } from '../middleware/auth.middleware.js';
import {
  getCurrentPeriod,
  getRoster,
  getEmployeePreview,
  listEmployeeCycles,
  getMyCycles,
  getCycle,
  getCycleByEvent,
  postCreateCycle,
  postLinkEvent,
  putSaveDraft,
  postSubmit,
  postAdminComment,
  postReopen,
  postClose,
  listJobTemplates,
  postGenerateJobTemplate,
  postAttachJobTemplate,
  listAgencyTemplates
} from '../controllers/employeeEvaluation.controller.js';

const router = express.Router();

router.use(authenticate);

router.get('/period', getCurrentPeriod);
router.get('/me/cycles', getMyCycles);
router.get('/cycles/:cycleId', getCycle);
router.get('/events/:eventId/cycle', getCycleByEvent);
router.put('/cycles/:cycleId/draft', putSaveDraft);
router.post('/cycles/:cycleId/submit', postSubmit);

// Admin / people-ops
router.get('/roster', requireCapability('canManageHiring'), getRoster);
router.get('/templates', requireCapability('canManageHiring'), listAgencyTemplates);
router.get('/employees/:userId/preview', requireCapability('canManageHiring'), getEmployeePreview);
router.get('/employees/:userId/cycles', listEmployeeCycles);
router.post('/cycles', requireCapability('canManageHiring'), postCreateCycle);
router.post('/cycles/:cycleId/link-event', requireCapability('canManageHiring'), postLinkEvent);
router.post('/cycles/:cycleId/admin-comment', requireCapability('canManageHiring'), postAdminComment);
router.post('/cycles/:cycleId/reopen', requireCapability('canManageHiring'), postReopen);
router.post('/cycles/:cycleId/close', requireCapability('canManageHiring'), postClose);
router.get('/jobs/:jobDescriptionId/templates', requireCapability('canManageHiring'), listJobTemplates);
router.post('/jobs/:jobDescriptionId/generate-template', requireCapability('canManageHiring'), postGenerateJobTemplate);
router.post('/jobs/:jobDescriptionId/attach-template', requireCapability('canManageHiring'), postAttachJobTemplate);

export default router;
