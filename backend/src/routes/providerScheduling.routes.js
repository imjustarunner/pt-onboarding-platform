import express from 'express';
import { requireTransitionManager, requireTransitionPractice, getTransitionPractices, getTransitionRoster, getTransitionClients, getTransitionMeetings, getTransitionEmailRecipients, getTransitionWeek, putTransitionWeek } from '../controllers/transitionWeek.controller.js';
import { authenticate, requireAgencyAdmin } from '../middleware/auth.middleware.js';
import {
  listProvidersForScheduling,
  listProvidersAffiliatedWithSchool,
  listProviderSchoolAssignments,
  upsertProviderSchoolAssignment,
  availabilityReport
} from '../controllers/providerScheduling.controller.js';

const router = express.Router();

router.get('/transition-workspace/practices', authenticate, getTransitionPractices);
router.get('/transition-workspace/roster', authenticate, requireTransitionManager, requireTransitionPractice, getTransitionRoster);
router.get('/transition-workspace/clients', authenticate, requireTransitionManager, requireTransitionPractice, getTransitionClients);
router.get('/transition-workspace/email-recipients', authenticate, requireTransitionManager, requireTransitionPractice, getTransitionEmailRecipients);
router.get('/transition-workspace/meetings', authenticate, requireTransitionManager, requireTransitionPractice, getTransitionMeetings);
router.get('/transition-week', authenticate, requireTransitionManager, requireTransitionPractice, getTransitionWeek);
router.put('/transition-week', authenticate, requireTransitionManager, requireTransitionPractice, putTransitionWeek);

router.get('/providers', authenticate, requireAgencyAdmin, listProvidersForScheduling);
router.get('/affiliated-providers', authenticate, requireAgencyAdmin, listProvidersAffiliatedWithSchool);
router.get('/assignments', authenticate, requireAgencyAdmin, listProviderSchoolAssignments);
router.post('/assignments', authenticate, requireAgencyAdmin, upsertProviderSchoolAssignment);
router.get('/report', authenticate, requireAgencyAdmin, availabilityReport);

export default router;

