import express from 'express';
import {
  getAgencyServicesHub,
  listCounselors,
  listTutors,
  getProviderDetail,
  getProviderSlots,
  createBookingRequest,
  listEnrollments,
  upsertEnrollment,
  removeEnrollment,
  getTutoringProfileForUser,
  upsertTutoringProfile,
  upsertAgencyServiceType
} from '../controllers/publicAgencyServices.controller.js';

const router = express.Router();

// Public — no auth
router.get('/:agencySlug', getAgencyServicesHub);
router.get('/:agencySlug/counselors', listCounselors);
router.get('/:agencySlug/tutors', listTutors);
router.get('/:agencySlug/providers/:providerId', getProviderDetail);
router.get('/:agencySlug/providers/:providerId/slots', getProviderSlots);
router.post('/:agencySlug/requests', createBookingRequest);

// Admin/provider-facing endpoints — auth is enforced by the server.js mount
// point (these are mounted under /api/public/agency-services which is public,
// but enrollment + profile writes require a logged-in session that is validated
// inside the controller for slug ↔ agency ownership).
router.get('/:agencySlug/enrollment', listEnrollments);
router.post('/:agencySlug/enrollment', upsertEnrollment);
router.delete('/:agencySlug/enrollment/:userId', removeEnrollment);
router.get('/:agencySlug/tutoring-profiles/:userId', getTutoringProfileForUser);
router.put('/:agencySlug/tutoring-profiles/:userId', upsertTutoringProfile);

// Agency-level service type config (admin)
router.post('/:agencySlug/service-types', upsertAgencyServiceType);

export default router;
