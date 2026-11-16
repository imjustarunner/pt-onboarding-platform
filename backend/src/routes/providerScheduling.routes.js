import express from 'express';
import { requireTransitionManager, getTransitionWeek, putTransitionWeek } from '../controllers/transitionWeek.controller.js';
import { authenticate, requireAgencyAdmin } from '../middleware/auth.middleware.js';
import {
  listProvidersForScheduling,
  listProvidersAffiliatedWithSchool,
  listProviderSchoolAssignments,
  upsertProviderSchoolAssignment,
  availabilityReport
} from '../controllers/providerScheduling.controller.js';

const router = express.Router();

router.get('/transition-week', authenticate, requireTransitionManager, getTransitionWeek);
router.put('/transition-week', authenticate, requireTransitionManager, putTransitionWeek);

router.get('/providers', authenticate, requireAgencyAdmin, listProvidersForScheduling);
router.get('/affiliated-providers', authenticate, requireAgencyAdmin, listProvidersAffiliatedWithSchool);
router.get('/assignments', authenticate, requireAgencyAdmin, listProviderSchoolAssignments);
router.post('/assignments', authenticate, requireAgencyAdmin, upsertProviderSchoolAssignment);
router.get('/report', authenticate, requireAgencyAdmin, availabilityReport);

export default router;

