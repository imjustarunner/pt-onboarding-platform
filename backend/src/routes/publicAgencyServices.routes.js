import { authenticate } from '../middleware/auth.middleware.js';
import { requireHoldManager, listPendingHolds, resolvePendingHold, checkPublicHold } from '../controllers/publicProviderHoldAdmin.controller.js';
import rateLimit from 'express-rate-limit';
import express from 'express';
import {
  createProviderSlotHold,
  releaseProviderSlotHold,
  getAgencyServicesHub,
  listChooseProviders,
  listCounselors,
  listCoaches,
  listConsultants,
  listTutors,
  listEvaluators,
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
router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

// Public — no auth
router.get('/:agencySlug', getAgencyServicesHub);
router.get('/:agencySlug/choose-providers', listChooseProviders);
router.get('/:agencySlug/counselors', listCounselors);
router.get('/:agencySlug/coaches', listCoaches);
router.get('/:agencySlug/consultants', listConsultants);
router.get('/:agencySlug/tutors', listTutors);
router.get('/:agencySlug/evaluators', listEvaluators);
router.get('/:agencySlug/providers/:providerId', getProviderDetail);
router.get('/:agencySlug/providers/:providerId/slots', getProviderSlots);
const selectionLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
router.post('/:agencySlug/providers/:providerId/holds', selectionLimiter, createProviderSlotHold);
router.post('/:agencySlug/release-hold', selectionLimiter, releaseProviderSlotHold);
const statusLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });
router.post('/:agencySlug/hold-status', statusLimiter, checkPublicHold);
router.get('/:agencySlug/pending-holds', authenticate, requireHoldManager, listPendingHolds);
router.post('/:agencySlug/pending-holds/:holdId/resolve', authenticate, requireHoldManager, resolvePendingHold);
router.post('/:agencySlug/requests', createBookingRequest);

// Management endpoints require an authenticated, agency-scoped staff member.
router.get('/:agencySlug/enrollment', authenticate, requireHoldManager, listEnrollments);
router.post('/:agencySlug/enrollment', authenticate, requireHoldManager, upsertEnrollment);
router.delete('/:agencySlug/enrollment/:userId', authenticate, requireHoldManager, removeEnrollment);
// Public rate/package details are also consumed by the guardian tutoring portal.
router.get('/:agencySlug/tutoring-profiles/:userId', getTutoringProfileForUser);
router.put('/:agencySlug/tutoring-profiles/:userId', authenticate, requireHoldManager, upsertTutoringProfile);

// Agency-level service type config (admin)
router.post('/:agencySlug/service-types', authenticate, requireHoldManager, upsertAgencyServiceType);

export default router;
