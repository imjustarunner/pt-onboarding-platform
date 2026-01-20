import express from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  listProviderAffiliations,
  getProviderSchoolAssignments,
  upsertProviderSchoolAssignments
} from '../controllers/providerSelfAffiliations.controller.js';

const router = express.Router();

router.use(authenticate);

// List a provider's affiliated school/program organizations.
// - Provider self: GET /api/provider-self/affiliations
// - Admin/support: GET /api/provider-self/affiliations?providerUserId=123
router.get('/affiliations', listProviderAffiliations);

// Get provider_school_assignments for a school/program org.
// - Provider self: GET /api/provider-self/affiliations/:schoolId/assignments
// - Admin/support: GET /api/provider-self/affiliations/:schoolId/assignments?providerUserId=123
router.get('/affiliations/:schoolId/assignments', getProviderSchoolAssignments);

// Upsert provider_school_assignments for a school/program org.
// - Provider self: PUT /api/provider-self/affiliations/:schoolId/assignments
// - Admin/support: PUT /api/provider-self/affiliations/:schoolId/assignments?providerUserId=123
router.put('/affiliations/:schoolId/assignments', upsertProviderSchoolAssignments);

export default router;

