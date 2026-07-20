import express from 'express';
import { body, param, query } from 'express-validator';
import { authenticate, requireActiveStatus } from '../middleware/auth.middleware.js';
import {
  requireMedicalBillingMaster,
  requireClinicalChart,
  requireClinicalNoteSigning,
  requireMedicalClaims,
  requireClaimMd,
  requireMedicalBillingActorAccess,
  requireMedicalBillingReportAccess
} from '../middleware/medicalBilling.middleware.js';

const claimsGate = [requireMedicalClaims, requireMedicalBillingActorAccess];
const claimMdGate = [requireClaimMd, requireMedicalBillingActorAccess];
const masterGate = [requireMedicalBillingMaster, requireMedicalBillingActorAccess];
const reportsGate = [...masterGate, requireMedicalBillingReportAccess];
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
  ensureSchoolServiceLocation,
  updateServiceLocation,
  applyEncounterBilling,
  listMedicalBillingReportCatalog,
  runMedicalBillingReport,
  exportMedicalBillingReportCsv
} from '../controllers/medicalBilling.controller.js';

const router = express.Router();

router.use(authenticate, requireActiveStatus);

router.get(
  '/status',
  requireMedicalBillingActorAccess,
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
  ...claimsGate,
  [query('agencyId').isInt({ min: 1 })],
  listFeeSchedule
);

router.post(
  '/fee-schedule',
  ...claimsGate,
  [
    body('agencyId').isInt({ min: 1 }),
    body('procedureCode').isString().isLength({ min: 1, max: 16 })
  ],
  upsertFeeScheduleItem
);

router.get(
  '/claims',
  ...claimsGate,
  [query('agencyId').isInt({ min: 1 })],
  listMedicalClaims
);

router.post(
  '/claims',
  ...claimsGate,
  [
    body('agencyId').isInt({ min: 1 }),
    body('clientId').isInt({ min: 1 }),
    body('clinicalSessionId').isInt({ min: 1 })
  ],
  createMedicalClaim
);

router.post(
  '/claimmd/credentials',
  ...claimMdGate,
  [
    body('agencyId').isInt({ min: 1 }),
    body('accountKey').isString().isLength({ min: 8 })
  ],
  saveClaimMdCredentials
);

router.post(
  '/claimmd/claims/:claimId/submit',
  ...claimMdGate,
  [
    param('claimId').isInt({ min: 1 }),
    body('agencyId').isInt({ min: 1 })
  ],
  submitClaimToClaimMd
);

router.get(
  '/claimmd/responses',
  ...claimMdGate,
  [query('agencyId').isInt({ min: 1 })],
  refreshClaimMdResponses
);

router.get(
  '/claimmd/eras',
  ...claimMdGate,
  [query('agencyId').isInt({ min: 1 })],
  listClaimMdEras
);

router.post(
  '/claimmd/eligibility',
  ...claimMdGate,
  [body('agencyId').isInt({ min: 1 })],
  checkClaimMdEligibility
);

// Convenience: master-only ping
router.get(
  '/ping',
  ...masterGate,
  [query('agencyId').isInt({ min: 1 })],
  (req, res) => res.json({ ok: true, flags: req.medicalBillingFlags })
);

router.get(
  '/reports/catalog',
  ...reportsGate,
  [query('agencyId').isInt({ min: 1 })],
  listMedicalBillingReportCatalog
);

router.get(
  '/reports/export.csv',
  ...reportsGate,
  [query('agencyId').isInt({ min: 1 }), query('type').optional().isString().isLength({ min: 1, max: 40 })],
  exportMedicalBillingReportCsv
);

router.get(
  '/reports',
  ...reportsGate,
  [query('agencyId').isInt({ min: 1 }), query('type').optional().isString().isLength({ min: 1, max: 40 })],
  runMedicalBillingReport
);

router.get(
  '/service-codes',
  ...masterGate,
  [query('agencyId').isInt({ min: 1 })],
  listMedicalServiceCodes
);

router.post(
  '/service-codes',
  ...masterGate,
  [
    body('agencyId').isInt({ min: 1 }),
    body('serviceCode').isString().isLength({ min: 1, max: 32 })
  ],
  upsertMedicalServiceCode
);

router.post(
  '/service-codes/preview-units',
  ...masterGate,
  [
    body('agencyId').isInt({ min: 1 }),
    body('serviceCode').isString().isLength({ min: 1, max: 32 }),
    body('minutes').isFloat({ min: 0 })
  ],
  previewServiceCodeUnits
);

router.get(
  '/service-locations',
  ...masterGate,
  [query('agencyId').isInt({ min: 1 })],
  listServiceLocations
);

router.post(
  '/service-locations',
  ...masterGate,
  [
    body('agencyId').isInt({ min: 1 }),
    body('name').isString().isLength({ min: 1, max: 255 }),
    body('placeOfService').isString().isLength({ min: 1, max: 2 })
  ],
  createServiceLocation
);

/** Bookers can ensure a school site location without full medical-billing admin. */
router.post(
  '/service-locations/ensure-school',
  [
    body('agencyId').isInt({ min: 1 }),
    body('schoolOrganizationId').isInt({ min: 1 })
  ],
  ensureSchoolServiceLocation
);

router.patch(
  '/service-locations/:locationId',
  ...masterGate,
  [
    param('locationId').isInt({ min: 1 }),
    body('agencyId').isInt({ min: 1 })
  ],
  updateServiceLocation
);

router.post(
  '/sessions/:sessionId/apply-billing',
  ...claimsGate,
  [
    param('sessionId').isInt({ min: 1 }),
    body('agencyId').isInt({ min: 1 })
  ],
  applyEncounterBilling
);

export default router;
