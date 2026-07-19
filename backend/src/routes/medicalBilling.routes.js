import express from 'express';
import { body, param, query } from 'express-validator';
import { authenticate, requireActiveStatus } from '../middleware/auth.middleware.js';
import {
  requireMedicalBillingMaster,
  requireClinicalChart,
  requireClinicalNoteSigning,
  requireMedicalClaims,
  requireClaimMd
} from '../middleware/medicalBilling.middleware.js';
import {
  getMedicalBillingStatus,
  saveTreatmentPlanToChart,
  listClientChart,
  updateEncounter,
  signClinicalNote,
  cosignClinicalNote,
  listNotesForSigning,
  upsertDiagnosis,
  listFeeSchedule,
  upsertFeeScheduleItem,
  createMedicalClaim,
  listMedicalClaims,
  saveClaimMdCredentials,
  submitClaimToClaimMd,
  refreshClaimMdResponses,
  listClaimMdEras,
  checkClaimMdEligibility,
  listMedicalServiceCodes,
  upsertMedicalServiceCode,
  previewServiceCodeUnits,
  listServiceLocations,
  createServiceLocation,
  updateServiceLocation,
  applyEncounterBilling
} from '../controllers/medicalBilling.controller.js';

const router = express.Router();

router.use(authenticate, requireActiveStatus);

router.get(
  '/status',
  [query('agencyId').isInt({ min: 1 })],
  getMedicalBillingStatus
);

router.post(
  '/treatment-plans',
  requireClinicalChart,
  [
    body('agencyId').isInt({ min: 1 }),
    body('clientId').isInt({ min: 1 }),
    body('goals').optional().isArray()
  ],
  saveTreatmentPlanToChart
);

router.get(
  '/clients/:clientId/chart',
  requireClinicalChart,
  [
    param('clientId').isInt({ min: 1 }),
    query('agencyId').isInt({ min: 1 })
  ],
  listClientChart
);

router.patch(
  '/sessions/:sessionId/encounter',
  requireClinicalChart,
  [param('sessionId').isInt({ min: 1 }), body('agencyId').isInt({ min: 1 })],
  updateEncounter
);

router.post(
  '/notes/:noteId/sign',
  requireClinicalNoteSigning,
  [param('noteId').isInt({ min: 1 }), body('agencyId').isInt({ min: 1 })],
  signClinicalNote
);

router.post(
  '/notes/:noteId/cosign',
  requireClinicalNoteSigning,
  [param('noteId').isInt({ min: 1 }), body('agencyId').isInt({ min: 1 })],
  cosignClinicalNote
);

router.get(
  '/notes/signing',
  requireClinicalNoteSigning,
  [query('agencyId').isInt({ min: 1 })],
  listNotesForSigning
);

router.post(
  '/diagnoses',
  requireClinicalChart,
  [
    body('agencyId').isInt({ min: 1 }),
    body('clientId').isInt({ min: 1 }),
    body('icd10Code').isString().isLength({ min: 1, max: 16 })
  ],
  upsertDiagnosis
);

router.get(
  '/fee-schedule',
  requireMedicalClaims,
  [query('agencyId').isInt({ min: 1 })],
  listFeeSchedule
);

router.post(
  '/fee-schedule',
  requireMedicalClaims,
  [
    body('agencyId').isInt({ min: 1 }),
    body('procedureCode').isString().isLength({ min: 1, max: 16 })
  ],
  upsertFeeScheduleItem
);

router.get(
  '/claims',
  requireMedicalClaims,
  [query('agencyId').isInt({ min: 1 })],
  listMedicalClaims
);

router.post(
  '/claims',
  requireMedicalClaims,
  [
    body('agencyId').isInt({ min: 1 }),
    body('clientId').isInt({ min: 1 }),
    body('clinicalSessionId').isInt({ min: 1 })
  ],
  createMedicalClaim
);

router.post(
  '/claimmd/credentials',
  requireClaimMd,
  [
    body('agencyId').isInt({ min: 1 }),
    body('accountKey').isString().isLength({ min: 8 })
  ],
  saveClaimMdCredentials
);

router.post(
  '/claimmd/claims/:claimId/submit',
  requireClaimMd,
  [
    param('claimId').isInt({ min: 1 }),
    body('agencyId').isInt({ min: 1 })
  ],
  submitClaimToClaimMd
);

router.get(
  '/claimmd/responses',
  requireClaimMd,
  [query('agencyId').isInt({ min: 1 })],
  refreshClaimMdResponses
);

router.get(
  '/claimmd/eras',
  requireClaimMd,
  [query('agencyId').isInt({ min: 1 })],
  listClaimMdEras
);

router.post(
  '/claimmd/eligibility',
  requireClaimMd,
  [body('agencyId').isInt({ min: 1 })],
  checkClaimMdEligibility
);

// Convenience: master-only ping
router.get(
  '/ping',
  requireMedicalBillingMaster,
  [query('agencyId').isInt({ min: 1 })],
  (req, res) => res.json({ ok: true, flags: req.medicalBillingFlags })
);

router.get(
  '/service-codes',
  requireMedicalBillingMaster,
  [query('agencyId').isInt({ min: 1 })],
  listMedicalServiceCodes
);

router.post(
  '/service-codes',
  requireMedicalBillingMaster,
  [
    body('agencyId').isInt({ min: 1 }),
    body('serviceCode').isString().isLength({ min: 1, max: 32 })
  ],
  upsertMedicalServiceCode
);

router.post(
  '/service-codes/preview-units',
  requireMedicalBillingMaster,
  [
    body('agencyId').isInt({ min: 1 }),
    body('serviceCode').isString().isLength({ min: 1, max: 32 }),
    body('minutes').isFloat({ min: 0 })
  ],
  previewServiceCodeUnits
);

router.get(
  '/service-locations',
  requireMedicalBillingMaster,
  [query('agencyId').isInt({ min: 1 })],
  listServiceLocations
);

router.post(
  '/service-locations',
  requireMedicalBillingMaster,
  [
    body('agencyId').isInt({ min: 1 }),
    body('name').isString().isLength({ min: 1, max: 255 }),
    body('placeOfService').isString().isLength({ min: 1, max: 2 })
  ],
  createServiceLocation
);

router.patch(
  '/service-locations/:locationId',
  requireMedicalBillingMaster,
  [
    param('locationId').isInt({ min: 1 }),
    body('agencyId').isInt({ min: 1 })
  ],
  updateServiceLocation
);

router.post(
  '/sessions/:sessionId/apply-billing',
  requireMedicalClaims,
  [
    param('sessionId').isInt({ min: 1 }),
    body('agencyId').isInt({ min: 1 })
  ],
  applyEncounterBilling
);

export default router;
