import express from 'express';
import { getSchoolClients, getSchoolPortalAffiliation } from '../controllers/schoolPortal.controller.js';
import {
  listSchoolProvidersForScheduling,
  listScheduleEntries,
  listAssignedClientsForProviderDay,
  createScheduleEntry,
  updateScheduleEntry,
  moveScheduleEntry,
  deleteScheduleEntry
} from '../controllers/schoolProviderSchedule.controller.js';
import {
  listSchoolDays,
  upsertSchoolDay,
  listDayProviders,
  addProviderToDay,
  getSoftScheduleSlots,
  putSoftScheduleSlots,
  moveSoftScheduleSlot
} from '../controllers/schoolSoftSchedule.controller.js';
import {
  getProviderSchoolProfile,
  getProviderSchoolCaseloadSlots
} from '../controllers/schoolProviderProfile.controller.js';
import {
  listSkillsGroups,
  createSkillsGroup,
  updateSkillsGroup,
  deleteSkillsGroup,
  updateSkillsGroupProvider,
  updateSkillsGroupClient,
  listSkillsEligibleClients,
  listSkillsEligibleProviders
} from '../controllers/schoolSkillsGroups.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

// School portal routes (authenticated)
// GET /api/school-portal/:organizationId/clients
router.get('/:organizationId/clients', authenticate, getSchoolClients);
router.get('/:schoolId/affiliation', authenticate, getSchoolPortalAffiliation);

// Provider page within a school (profile + slot-based caseload)
router.get('/:schoolId/providers/:providerId/profile', authenticate, getProviderSchoolProfile);
router.get('/:schoolId/providers/:providerId/caseload-slots', authenticate, getProviderSchoolCaseloadSlots);

// School Portal redesign: days + soft schedule slots (Mon–Fri)
router.get('/:schoolId/days', authenticate, listSchoolDays);
router.post('/:schoolId/days/:weekday', authenticate, upsertSchoolDay);
router.get('/:schoolId/days/:weekday/providers', authenticate, listDayProviders);
router.post('/:schoolId/days/:weekday/providers', authenticate, addProviderToDay);
router.get('/:schoolId/days/:weekday/providers/:providerId/soft-slots', authenticate, getSoftScheduleSlots);
router.put('/:schoolId/days/:weekday/providers/:providerId/soft-slots', authenticate, putSoftScheduleSlots);
router.post('/:schoolId/days/:weekday/providers/:providerId/soft-slots/:slotId/move', authenticate, moveSoftScheduleSlot);

// Provider scheduling (school-entered schedule)
router.get('/:schoolId/providers/scheduling', authenticate, listSchoolProvidersForScheduling);
router.get('/:schoolId/providers/:providerId/assigned-clients', authenticate, listAssignedClientsForProviderDay);
router.get('/:schoolId/providers/:providerId/schedule-entries', authenticate, listScheduleEntries);
router.post('/:schoolId/providers/:providerId/schedule-entries', authenticate, createScheduleEntry);
router.put('/:schoolId/providers/:providerId/schedule-entries/:entryId', authenticate, updateScheduleEntry);
router.post('/:schoolId/providers/:providerId/schedule-entries/:entryId/move', authenticate, moveScheduleEntry);
router.delete('/:schoolId/providers/:providerId/schedule-entries/:entryId', authenticate, deleteScheduleEntry);

// School-scoped provider assignment (slot-safe)
// Skills Groups (org-scoped; initially used in school portal UI)
router.get('/:orgId/skills-groups', authenticate, listSkillsGroups);
router.post('/:orgId/skills-groups', authenticate, createSkillsGroup);
router.put('/:orgId/skills-groups/:groupId', authenticate, updateSkillsGroup);
router.delete('/:orgId/skills-groups/:groupId', authenticate, deleteSkillsGroup);
router.post('/:orgId/skills-groups/:groupId/providers', authenticate, updateSkillsGroupProvider);
router.post('/:orgId/skills-groups/:groupId/clients', authenticate, updateSkillsGroupClient);
router.get('/:orgId/skills-eligible-clients', authenticate, listSkillsEligibleClients);
router.get('/:orgId/skills-eligible-providers', authenticate, listSkillsEligibleProviders);

export default router;
