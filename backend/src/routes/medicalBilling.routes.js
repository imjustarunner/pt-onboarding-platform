import {indexRemittances,getRemittance,syncEras,retryBalances,matchEra,postEra} from '../controllers/remittance.controller.js';
import { getBankFeeds, createBankSession, finishBankSession, removeBankFeed, importBankFeed, verifyEraDeposit } from '../controllers/bankFeed.controller.js';
import {getMedicalServiceFees,saveMedicalServiceFees} from '../controllers/medicalServiceFees.controller.js';
import {getEligibilityAutomation,saveEligibilitySettings,enrollEligibilityRoster} from '../controllers/eligibilityAutomation.controller.js';
import { getEft, saveEft, getEftHistory } from '../controllers/payerEft.controller.js';
import { listTreatmentFrequencies, addTreatmentFrequency, suggestObjectiveInterventions } from '../controllers/treatmentPlanOptions.controller.js';
import { getTreatmentPlanRenewalPolicy, saveTreatmentPlanRenewalPolicy } from '../controllers/medicalBilling.controller.js';
import { getClientInsurance, saveClientInsurance } from '../controllers/clientInsurance.controller.js';
import { getCoverageEvidence, checkClientCoverage, reviewClientCoverage } from '../controllers/coverageVerification.controller.js';
import { createSecondaryClaim } from '../controllers/claimMdWorkflow.controller.js';
import express from 'express';
import { getAppointmentBilling, getPlannedBillingServices } from '../controllers/appointmentBilling.controller.js';
import { payerSetupRequests } from '../controllers/payerSetupRequest.controller.js';
import { listSupervisedPayerPolicies, saveSupervisedPayerPolicy, supervisedProviderReadiness } from '../controllers/supervisedBilling.controller.js';
import { runClaimAiReview, resolveClaimAiFinding } from '../controllers/claimMdWorkflow.controller.js';
import { getBillingWorkspace } from '../controllers/claimMdWorkspace.controller.js';
import { reviewClaim, claimHistory, claimDraft, listUndraftedNotes, correctClaim, searchClaimMdPayers, startClaimMdEnrollment, listClaimMdEnrollments, listClaimMdOffices } from '../controllers/claimMdWorkflow.controller.js';
import { getClaimServiceChanges,resolveClaimServiceChange } from '../controllers/claimMdWorkflow.controller.js';
import { body, param, query } from 'express-validator';
import { authenticate, requireActiveStatus } from '../middleware/auth.middleware.js';
import {
  requireMedicalBillingMaster,
  requireClinicalChart,
  requireClinicalNoteSigning,
  requireMedicalClaims,
  requireClaimMd,
  requireMedicalBillingActorAccess,
  requireMedicalBillingReportAccess,
  requireMedicalBillingFinancialAccess
} from '../middleware/medicalBilling.middleware.js';

const claimsGate = [requireMedicalClaims, requireMedicalBillingActorAccess];
const claimMdGate = [requireClaimMd, requireMedicalBillingFinancialAccess];
const masterGate = [requireMedicalBillingMaster, requireMedicalBillingActorAccess];
const reportsGate = [...masterGate, requireMedicalBillingReportAccess];
import {
  getMedicalBillingStatus,
  saveTreatmentPlanToChart,
  getTreatmentPlanById,
  voidPacketBootstrapTreatmentPlanDrafts,
  discardTreatmentPlanDraft,
  getClaimBillingMode,
  updateClaimBillingMode,
  parseTreatmentPlanImport,
  normalizeTreatmentPlanObjective,
  suggestTreatmentPlanDischarge,
  proposeTreatmentPlanUpdate,
  listClientChart,
  createObjectiveRating,
  listClientObjectiveRatings,
  amendTreatmentPlan,
  setTreatmentPlanKioskShare,
  updateTreatmentPlanPrescribedFrequency,
  updateObjectiveKioskPrompts,
  updateEncounter,
  signClinicalNote,
  cosignClinicalNote,
  listNotesForSigning,
  getClinicalNoteById,
  downloadTreatmentSummaryPdf,
  attachTreatmentSummaryPrintUpload,
  upsertDiagnosis,
  listFeeSchedule,
  upsertFeeScheduleItem,
  createMedicalClaim,
  listMedicalClaims,
  listBillingClaimOverrides,
  upsertBillingClaimOverride,
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
  listClinicalInterventions,
  addClinicalInterventions,
  createClinicalNoteAddendum,
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

router.use(authenticate, requireActiveStatus, (req,res,next)=>{res.set('Cache-Control','no-store');next();});
router.get('/sessions/:sessionId/appointment-billing', requireMedicalClaims, getAppointmentBilling);
router.get('/planned-services', ...claimsGate, requireMedicalBillingFinancialAccess, getPlannedBillingServices);
router.get('/payer-setup-requests', ...claimsGate, requireMedicalBillingFinancialAccess, payerSetupRequests);
router.post('/payer-setup-requests', ...claimsGate, requireMedicalBillingFinancialAccess, payerSetupRequests);
router.get('/workspace', getBillingWorkspace);
router.get('/supervised-payer-policies', requireMedicalBillingFinancialAccess, listSupervisedPayerPolicies);
router.get('/supervised-provider-readiness', requireMedicalBillingFinancialAccess, supervisedProviderReadiness);
router.post('/supervised-payer-policies', requireMedicalBillingFinancialAccess, saveSupervisedPayerPolicy);
router.get('/service-fees', ...masterGate, requireMedicalBillingFinancialAccess, getMedicalServiceFees);
router.get('/bank-feeds', ...masterGate, requireMedicalBillingFinancialAccess, getBankFeeds);
router.post('/bank-feeds/sessions', ...masterGate, requireMedicalBillingFinancialAccess, createBankSession);
router.post('/bank-feeds/sessions/complete', ...masterGate, requireMedicalBillingFinancialAccess, finishBankSession);
router.post('/bank-feeds/:id/disconnect', ...masterGate, requireMedicalBillingFinancialAccess, removeBankFeed);
router.post('/bank-feeds/:id/verify-era', ...masterGate, requireMedicalBillingFinancialAccess, verifyEraDeposit);
router.post('/bank-feeds/:id/sync', ...masterGate, requireMedicalBillingFinancialAccess, importBankFeed);
router.put('/service-fees', ...masterGate, requireMedicalBillingFinancialAccess, saveMedicalServiceFees);
router.get('/eligibility-automation', ...masterGate, requireMedicalBillingFinancialAccess, getEligibilityAutomation);
router.put('/eligibility-automation', ...masterGate, requireMedicalBillingFinancialAccess, saveEligibilitySettings);
router.put('/eligibility-automation/clients', ...masterGate, requireMedicalBillingFinancialAccess, enrollEligibilityRoster);
router.get('/payer-eft', ...masterGate, requireMedicalBillingFinancialAccess, getEft);
router.post('/payer-eft', ...masterGate, requireMedicalBillingFinancialAccess, saveEft);
router.get('/payer-eft/:id/history', ...masterGate, requireMedicalBillingFinancialAccess, getEftHistory);
router.get('/clients/:clientId/insurance', ...masterGate, requireMedicalBillingFinancialAccess, getClientInsurance);
router.put('/clients/:clientId/insurance', ...masterGate, requireMedicalBillingFinancialAccess, saveClientInsurance);
router.get('/clients/:clientId/coverage', ...masterGate, requireMedicalBillingFinancialAccess, getCoverageEvidence);
router.post('/clients/:clientId/coverage/check', ...claimMdGate, checkClientCoverage);
router.post('/clients/:clientId/coverage/review', ...masterGate, requireMedicalBillingFinancialAccess, reviewClientCoverage);
router.post('/claims/:claimId/secondary', ...claimMdGate, createSecondaryClaim);

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

router.post(
  '/treatment-plans/void-bootstrap-drafts',
  requireClinicalChart,
  [
    body('agencyId').isInt({ min: 1 }),
    body('clientId').isInt({ min: 1 }),
    body('exceptPlanId').optional().isInt({ min: 1 })
  ],
  voidPacketBootstrapTreatmentPlanDrafts
);

router.post(
  '/treatment-plans/:planId/discard',
  requireClinicalChart,
  [
    param('planId').isInt({ min: 1 }),
    body('agencyId').isInt({ min: 1 }),
    body('clientId').isInt({ min: 1 })
  ],
  discardTreatmentPlanDraft
);

router.get(
  '/claim-billing-mode',
  requireMedicalBillingActorAccess,
  requireMedicalBillingFinancialAccess,
  [query('agencyId').isInt({ min: 1 })],
  getClaimBillingMode
);

router.patch(
  '/claim-billing-mode',
  requireMedicalBillingActorAccess,
  requireMedicalBillingFinancialAccess,
  [
    body('agencyId').isInt({ min: 1 }),
    body('mode').isIn(['self', 'billing_supervisor']),
    body('userId').optional().isInt({ min: 1 })
  ],
  updateClaimBillingMode
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
    body('objectiveText').isString().notEmpty(),
    body('clinicianInstructions').optional().isString(),
    body('instructions').optional().isString()
  ],
  normalizeTreatmentPlanObjective
);

router.post(
  '/treatment-plans/suggest-discharge',
  requireClinicalChart,
  [
    body('agencyId').isInt({ min: 1 }),
    body('clientId').isInt({ min: 1 }),
    body('presentingProblem').optional().isString(),
    body('prescribedFrequency').optional().isString(),
    body('diagnoses').optional().isArray(),
    body('goals').optional().isArray()
  ],
  suggestTreatmentPlanDischarge
);

router.post(
  '/treatment-plans/propose-update',
  requireClinicalChart,
  [
    body('agencyId').isInt({ min: 1 }),
    body('clientId').isInt({ min: 1 }),
    body('currentPlan').optional(),
    body('providerNarrative').optional().isString(),
    body('narrative').optional().isString(),
    body('pasteRewriteSource').optional().isString(),
    body('pasteText').optional().isString(),
    body('progressExcerpt').optional().isString(),
    body('renewalReason').optional().isString(),
    body('sinceDate').optional().isString()
  ],
  proposeTreatmentPlanUpdate
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

router.patch(
  '/treatment-plans/:planId/prescribed-frequency',
  requireClinicalChart,
  [
    param('planId').isInt({ min: 1 }),
    body('agencyId').isInt({ min: 1 }),
    body('clientId').isInt({ min: 1 }),
    body('prescribedFrequency').optional({ nullable: true }).isString()
  ],
  updateTreatmentPlanPrescribedFrequency
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
  [param('noteId').isInt({ min: 1 }), query('agencyId').optional({ nullable: true }).isInt({ min: 1 })],
  getClinicalNoteById
);

router.post(
  '/notes/:noteId/addenda',
  requireClinicalChart,
  [
    param('noteId').isInt({ min: 1 }),
    body('body').optional().isString().isLength({ min: 1, max: 20000 }),
    body('addendum').optional().isString().isLength({ min: 1, max: 20000 }),
    body('entryKind').isIn(['addendum', 'correction', 'late_entry']),
    body('reason').isString().isLength({ min: 1, max: 2000 }),
    body('authorAttested').equals('true')
  ],
  createClinicalNoteAddendum
);

router.get(
  '/notes/:noteId/treatment-summary-pdf',
  requireClinicalChart,
  [param('noteId').isInt({ min: 1 }), query('agencyId').optional({ nullable: true }).isInt({ min: 1 })],
  downloadTreatmentSummaryPdf
);

router.post(
  '/notes/:noteId/treatment-summary/print-upload',
  requireClinicalChart,
  [
    param('noteId').isInt({ min: 1 }),
    body('agencyId').isInt({ min: 1 }),
    body('phiDocumentId').isInt({ min: 1 }),
    body('signedByName').optional({ nullable: true }).isString().isLength({ max: 255 })
  ],
  attachTreatmentSummaryPrintUpload
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
  requireMedicalBillingFinancialAccess,
  [query('agencyId').isInt({ min: 1 })],
  listFeeSchedule
);

router.post(
  '/fee-schedule',
  ...claimsGate,
  requireMedicalBillingFinancialAccess,
  [
    body('agencyId').isInt({ min: 1 }),
    body('procedureCode').isString().isLength({ min: 1, max: 16 })
  ],
  upsertFeeScheduleItem
);

router.get(
  '/claims',
  ...claimsGate,
  requireMedicalBillingFinancialAccess,
  [query('agencyId').isInt({ min: 1 })],
  listMedicalClaims
);

router.get(
  '/claim-overrides',
  ...claimsGate,
  requireMedicalBillingFinancialAccess,
  [query('agencyId').isInt({ min: 1 })],
  listBillingClaimOverrides
);

router.post(
  '/claim-overrides',
  ...claimsGate,
  requireMedicalBillingFinancialAccess,
  [
    body('agencyId').isInt({ min: 1 }),
    body('scope').isString().isIn(['payer', 'client', 'claim']),
    body('toValue').isString().isLength({ min: 1, max: 64 }),
    body('fromValue').optional({ nullable: true }).isString(),
    body('payerName').optional({ nullable: true }).isString(),
    body('clientId').optional({ nullable: true }).isInt({ min: 1 }),
    body('claimId').optional({ nullable: true }).isInt({ min: 1 }),
    body('fieldKey').optional().isString(),
    body('isActive').optional(),
    body('notes').optional({ nullable: true }).isString(),
    body('id').optional().isInt({ min: 1 })
  ],
  upsertBillingClaimOverride
);

router.get(
  '/sessions/:sessionId/claim-readiness',
  ...claimsGate,
  requireMedicalBillingFinancialAccess,
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
  requireMedicalBillingFinancialAccess,
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
  (req, res, next) => ['admin', 'super_admin'].includes(req.user?.role) ? next() : res.status(403).json({ error: { message: 'Only administrators can change Claim.MD credentials' } }),
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

router.post('/claimmd/responses/sync', ...claimMdGate, refreshClaimMdResponses);
router.get('/claims/undrafted-notes', ...claimMdGate, listUndraftedNotes);
router.get('/claimmd/claims/:claimId/review', ...claimMdGate, reviewClaim);
router.post('/claimmd/claims/:claimId/ai-review', ...claimMdGate, runClaimAiReview);
router.post('/claimmd/claims/:claimId/ai-findings/resolve', ...claimMdGate, resolveClaimAiFinding);
router.get('/claimmd/claims/:claimId/history', ...claimMdGate, claimHistory);
router.get('/claimmd/claims/:claimId/service-changes', ...claimMdGate,getClaimServiceChanges);
router.post('/claimmd/claims/:claimId/service-changes/:requestId/resolve', ...claimMdGate,resolveClaimServiceChange);
router.get('/claimmd/claims/:claimId/draft', ...claimMdGate, claimDraft);
router.patch('/claimmd/claims/:claimId', ...claimMdGate, correctClaim);
router.get('/claimmd/remittances', ...claimMdGate, indexRemittances);
router.post('/claimmd/remittances/sync', ...claimMdGate, syncEras);
router.post('/claimmd/remittances/retry-balances', ...claimMdGate, retryBalances);
router.get('/claimmd/remittances/:id', ...claimMdGate, getRemittance);
router.post('/claimmd/remittances/:id/items/:itemId/match', ...claimMdGate, matchEra);
router.post('/claimmd/remittances/:id/items/:itemId/post', ...claimMdGate, postEra);
router.get('/claimmd/payers', ...claimMdGate, searchClaimMdPayers);
router.get('/claimmd/billing-offices', ...claimMdGate, listClaimMdOffices);
router.get('/claimmd/enrollments', ...claimMdGate, listClaimMdEnrollments);
router.post('/claimmd/enrollments', ...claimMdGate, startClaimMdEnrollment);

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
  requireMedicalBillingFinancialAccess,
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
  requireMedicalBillingFinancialAccess,
  [
    param('sessionId').isInt({ min: 1 }),
    body('agencyId').isInt({ min: 1 })
  ],
  applyEncounterBilling
);

router.get('/treatment-frequencies', requireClinicalChart,
  [query('agencyId').isInt({ min: 1 })], listTreatmentFrequencies);
router.post('/treatment-frequencies', requireClinicalChart,
  [body('agencyId').isInt({ min: 1 }), body('name').isString().trim().isLength({ min: 1, max: 160 })], addTreatmentFrequency);
router.post('/treatment-plans/recommend-interventions', requireClinicalChart,
  [body('agencyId').isInt({ min: 1 }), body('goalText').isString().trim().isLength({ min: 1, max: 10000 }), body('objectiveText').isString().trim().isLength({ min: 1, max: 10000 })], suggestObjectiveInterventions);

router.get(
  '/interventions',
  requireClinicalChart,
  [query('agencyId').isInt({ min: 1 })],
  listClinicalInterventions
);

router.post(
  '/interventions',
  requireClinicalChart,
  [
    body('agencyId').isInt({ min: 1 }),
    body('scope').optional().isString(),
    body('name').optional().isString(),
    body('names').optional()
  ],
  addClinicalInterventions
);

router.get('/agencies/:agencyId/treatment-plan-renewal', requireClinicalChart, getTreatmentPlanRenewalPolicy);
router.put('/agencies/:agencyId/treatment-plan-renewal', requireClinicalChart, saveTreatmentPlanRenewalPolicy);

export default router;
