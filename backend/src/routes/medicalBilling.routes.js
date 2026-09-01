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
  getTreatmentPlanById,
  parseTreatmentPlanImport,
  normalizeTreatmentPlanObjective,
  listClientChart,
  createObjectiveRating,
  listClientObjectiveRatings,
  amendTreatmentPlan,
  setTreatmentPlanKioskShare,
  updateObjectiveKioskPrompts,
  updateEncounter,
  signClinicalNote,
  cosignClinicalNote,
  listNotesForSigning,
  getClinicalNoteById,
  upsertDiagnosis,
  listFeeSchedule,
  upsertFeeScheduleItem,
  createMedicalClaim,
  listMedicalClaims,
  getSessionClaimReadiness,
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
import {
  listTreatmentPlanAcks,
  shareTreatmentPlanToDashboard,
  emailTreatmentPlanAckLink,
  startTreatmentPlanAckSession,
  completeTreatmentPlanAckSession,
  attachPrintedTreatmentPlanAck
} from '../controllers/treatmentPlanAck.controller.js';

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
  '/treatment-plans/:planId',
  requireClinicalChart,
  [
    param('planId').isInt({ min: 1 }),
    query('agencyId').isInt({ min: 1 }),
    query('clientId').isInt({ min: 1 })
  ],
  getTreatmentPlanById
);

router.post(
  '/treatment-plans/parse',
  requireClinicalChart,
  [
    body('agencyId').isInt({ min: 1 }),
    body('clientId').isInt({ min: 1 }),
    body('text').optional().isString(),
    body('planText').optional().isString()
  ],
  parseTreatmentPlanImport
);

router.post(
  '/treatment-plans/normalize-objective',
  requireClinicalChart,
  [
    body('agencyId').isInt({ min: 1 }),
    body('clientId').isInt({ min: 1 }),
    body('objectiveText').isString().notEmpty()
  ],
  normalizeTreatmentPlanObjective
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

router.post(
  '/objectives/:objectiveId/ratings',
  requireClinicalChart,
  [
    param('objectiveId').isInt({ min: 1 }),
    body('agencyId').isInt({ min: 1 }),
    body('clientId').isInt({ min: 1 }),
    body('disposition').optional().isString(),
    body('scaleValue').optional().isInt({ min: 1, max: 10 })
  ],
  createObjectiveRating
);

router.get(
  '/clients/:clientId/objective-ratings',
  requireClinicalChart,
  [
    param('clientId').isInt({ min: 1 }),
    query('agencyId').isInt({ min: 1 })
  ],
  listClientObjectiveRatings
);

router.patch(
  '/treatment-plans/:planId/kiosk-share',
  requireClinicalChart,
  [
    param('planId').isInt({ min: 1 }),
    body('agencyId').isInt({ min: 1 }),
    body('clientId').isInt({ min: 1 })
  ],
  setTreatmentPlanKioskShare
);

router.get(
  '/clients/:clientId/treatment-plans/:planId/acknowledgments',
  requireClinicalChart,
  [
    param('clientId').isInt({ min: 1 }),
    param('planId').isInt({ min: 1 }),
    query('agencyId').isInt({ min: 1 })
  ],
  listTreatmentPlanAcks
);

router.post(
  '/clients/:clientId/treatment-plans/:planId/acknowledgments/dashboard-share',
  requireClinicalChart,
  [
    param('clientId').isInt({ min: 1 }),
    param('planId').isInt({ min: 1 }),
    body('agencyId').isInt({ min: 1 })
  ],
  shareTreatmentPlanToDashboard
);

router.post(
  '/clients/:clientId/treatment-plans/:planId/acknowledgments/email',
  requireClinicalChart,
  [
    param('clientId').isInt({ min: 1 }),
    param('planId').isInt({ min: 1 }),
    body('agencyId').isInt({ min: 1 }),
    body('email').optional().isString(),
    body('recipientEmail').optional().isString()
  ],
  emailTreatmentPlanAckLink
);

router.post(
  '/clients/:clientId/treatment-plans/:planId/acknowledgments/session',
  requireClinicalChart,
  [
    param('clientId').isInt({ min: 1 }),
    param('planId').isInt({ min: 1 }),
    body('agencyId').isInt({ min: 1 })
  ],
  startTreatmentPlanAckSession
);

router.post(
  '/clients/:clientId/treatment-plans/:planId/acknowledgments/session/complete',
  requireClinicalChart,
  [
    param('clientId').isInt({ min: 1 }),
    param('planId').isInt({ min: 1 }),
    body('agencyId').isInt({ min: 1 }),
    body('linkId').isInt({ min: 1 }),
    body('signedByName').optional().isString()
  ],
  completeTreatmentPlanAckSession
);

router.post(
  '/clients/:clientId/treatment-plans/:planId/acknowledgments/print-upload',
  requireClinicalChart,
  [
    param('clientId').isInt({ min: 1 }),
    param('planId').isInt({ min: 1 }),
    body('agencyId').isInt({ min: 1 }),
    body('phiDocumentId').optional().isInt({ min: 1 }),
    body('documentId').optional().isInt({ min: 1 })
  ],
  attachPrintedTreatmentPlanAck
);

router.patch(
  '/objectives/:objectiveId/kiosk-prompts',
  requireClinicalChart,
  [
    param('objectiveId').isInt({ min: 1 }),
    body('agencyId').isInt({ min: 1 }),
    body('clientId').isInt({ min: 1 })
  ],
  updateObjectiveKioskPrompts
);

router.post(
  '/treatment-plans/:planId/amend',
  requireClinicalChart,
  [
    param('planId').isInt({ min: 1 }),
    body('agencyId').isInt({ min: 1 }),
    body('clientId').isInt({ min: 1 }),
    body('goals').optional().isArray()
  ],
  amendTreatmentPlan
);

router.patch(
  '/sessions/:sessionId/encounter',
  requireClinicalChart,
  [param('sessionId').isInt({ min: 1 }), body('agencyId').isInt({ min: 1 })],
  updateEncounter
);

router.get(
  '/notes/:noteId',
  requireClinicalChart,
  [param('noteId').isInt({ min: 1 }), query('agencyId').isInt({ min: 1 })],
  getClinicalNoteById
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

router.get(
  '/sessions/:sessionId/claim-readiness',
  ...claimsGate,
  [
    param('sessionId').isInt({ min: 1 }),
    query('agencyId').isInt({ min: 1 }),
    query('clientId').isInt({ min: 1 })
  ],
  getSessionClaimReadiness
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
