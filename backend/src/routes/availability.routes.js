import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getMyAvailabilityPending,
  getMyVirtualWorkingHours,
  putMyVirtualWorkingHours,
  createMyOfficeAvailabilityRequest,
  createMySchoolAvailabilityRequest,
  submitMySkillBuilderAvailability,
  confirmMySkillBuilderAvailability,
  confirmMySupervisedAvailability,
  listOfficeAvailabilityRequests,
  assignTemporaryOfficeFromRequest,
  listSchoolAvailabilityRequests,
  assignSchoolFromRequest,
  listAvailableSkills,
  upsertAvailableSkill,
  deactivateAvailableSkill,
  setProviderSkills,
  listProvidersForAvailability,
  searchAvailability,
  getAdminPendingCounts,
  listSkillBuildersAvailability,
  listPublicAppointmentRequests,
  setPublicAppointmentRequestStatus
} from '../controllers/availability.controller.js';

const router = express.Router();

router.use(authenticate);

router.get('/me/pending', getMyAvailabilityPending);
router.get('/me/virtual-working-hours', getMyVirtualWorkingHours);
router.put('/me/virtual-working-hours', putMyVirtualWorkingHours);
router.post('/office-requests', createMyOfficeAvailabilityRequest);
router.post('/school-requests', createMySchoolAvailabilityRequest);
router.post('/me/skill-builder/submit', submitMySkillBuilderAvailability);
router.post('/me/skill-builder/confirm', confirmMySkillBuilderAvailability);
router.post('/me/supervised/confirm', confirmMySupervisedAvailability);

// Admin/staff tools (RBAC is enforced inside controller)
router.get('/admin/office-requests', listOfficeAvailabilityRequests);
router.post('/admin/office-requests/:id/assign-temporary', assignTemporaryOfficeFromRequest);
router.get('/admin/school-requests', listSchoolAvailabilityRequests);
router.post('/admin/school-requests/:id/assign', assignSchoolFromRequest);

router.get('/admin/skills', listAvailableSkills);
router.post('/admin/skills', upsertAvailableSkill);
router.post('/admin/skills/:skillId/deactivate', deactivateAvailableSkill);
router.put('/admin/providers/:providerId/skills', setProviderSkills);
router.get('/admin/providers', listProvidersForAvailability);

router.get('/admin/pending-counts', getAdminPendingCounts);
router.get('/admin/skill-builders', listSkillBuildersAvailability);
router.get('/admin/search', searchAvailability);
router.get('/admin/public-appointment-requests', listPublicAppointmentRequests);
router.post('/admin/public-appointment-requests/:id/status', setPublicAppointmentRequestStatus);

export default router;

