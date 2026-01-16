import express from 'express';
import { getSchoolClients } from '../controllers/schoolPortal.controller.js';
import {
  listSchoolProvidersForScheduling,
  listScheduleEntries,
  createScheduleEntry,
  updateScheduleEntry,
  deleteScheduleEntry,
  assignProviderForSchoolClient
} from '../controllers/schoolProviderSchedule.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

// School portal routes (authenticated)
// GET /api/school-portal/:organizationId/clients
router.get('/:organizationId/clients', authenticate, getSchoolClients);

// Provider scheduling (school-entered schedule)
router.get('/:schoolId/providers/scheduling', authenticate, listSchoolProvidersForScheduling);
router.get('/:schoolId/providers/:providerId/schedule-entries', authenticate, listScheduleEntries);
router.post('/:schoolId/providers/:providerId/schedule-entries', authenticate, createScheduleEntry);
router.put('/:schoolId/providers/:providerId/schedule-entries/:entryId', authenticate, updateScheduleEntry);
router.delete('/:schoolId/providers/:providerId/schedule-entries/:entryId', authenticate, deleteScheduleEntry);

// School-scoped provider assignment (slot-safe)
router.post('/:schoolId/clients/:clientId/assign-provider', authenticate, assignProviderForSchoolClient);

export default router;
