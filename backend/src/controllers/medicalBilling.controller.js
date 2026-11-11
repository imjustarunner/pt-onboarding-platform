import {assistantBillingAuthorization,assertAssistantBillingCommand} from '../services/assistantBillingCommand.service.js';
import { isReviewedStarterPlan } from '../services/starterTreatmentPlanReview.service.js';
import { collapseClaimAttempts } from '../services/claimFamily.service.js';
import { attachClaimReferences } from '../services/clinicalClaimReferences.service.js';
import { getCanonicalFeeSchedule } from '../services/feeSchedule.service.js';
import { priceNewClaimLines } from '../services/newClaimFees.service.js';
import {reconcileNewClaimAfterHours,savedClinicalFunding,assertNoAutomaticProBonoClaim} from '../services/clinicalAfterHours.service.js';
import { listClientDiagnosisAlerts } from '../services/clinicalDiagnosisPolicy.service.js';
import { assertClinicalBillingApproval } from '../services/billingClinicalApproval.service.js';
import { clinicalNoteSnapshotHash, ensureOriginalRevision, appendOriginalSignature, hasPendingRevision, getRevisionSummary, listPendingRevisionWork, appendRevisionAddendum } from '../services/clinicalNoteVersion.service.js';
import { assertClientDiagnosisPolicy } from '../services/clinicalDiagnosisPolicy.service.js';
import { assertClinicalSigner, CLINICAL_SIGNER_ROLES } from '../services/clinicalNoteSigningToken.service.js';
import { getApprovedClinicalContext, assertClinicalVersionSubmission, clinicalVersionReference, approvedVersionBillingBlockers } from '../services/clinicalNoteVersionBilling.service.js';
import { screeningEncounterProposal } from '../services/h0002EncounterDetails.js';
import { logNoteAidChartEvent } from '../services/noteAidChartAudit.service.js';
import { assertLiveClearinghouseAgency, isSyntheticClearinghouseAgency } from '../services/syntheticClearinghouseGuard.service.js';
import { parseObject } from '../services/supervisedBillingPolicy.service.js';
import { sessionLocationLabel, reviewSnapshotToken, reviewRequestsForDisplay, effectiveServiceDetails, pendingServiceDetails, assertNoUnresolvedChanges, assertServiceDetailsComplete, markSupervisorQueue, synchronizeSupervisorQueue } from '../services/clinicalSupervisorReview.service.js';
import { validateScreeningSignature, completeH0002Screening, loadScreeningSource, H0002_SOURCE } from '../services/h0002ScreeningWorkflow.service.js';
import { providerBillingNpi } from '../services/providerBillingNpi.service.js';
import { assignedNoteLocations } from '../services/assignedNoteLocations.service.js';
import { requireStaffPlanActor } from '../utils/planStaffAccess.js';
import {assertNoSelfPayBalance} from '../services/familyLedger/serviceCharges.js';
import {reserveMedicalServiceUsage,completeMedicalServiceUsage} from '../services/medicalServiceFees.service.js';
import { resolveClaimMdConnection, claimMdConnectionMeta, requireClaimMdTransmission } from '../services/claimMdConnection.service.js';
import { prepareClaimReview } from './claimMdWorkflow.controller.js';
import { assertOriginalTransmissionAllowed } from '../services/claimServiceChanges.service.js';
import { recordClaimEvent, syncClaimMdResponses, asList } from '../services/claimMdWorkflow.service.js';
import { loadRenewalPolicy, renewalStatus } from '../services/treatmentPlanRenewal.service.js';
import { hasSchedulingBillingAccess, schedulingResponseForUser } from '../services/schedulingBillingAccess.service.js';
import Agency from '../models/Agency.model.js';
import { readClientInsurance } from '../services/clientInsurance.service.js';
import { encryptFamilyBilling } from '../services/familyBillingEncryption.service.js';
import { auditBilling } from '../services/familyBillingPolicy.service.js';
import crypto from 'crypto';
import { validationResult } from 'express-validator';
import { logAuditEvent } from '../services/auditEvent.service.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { queueCommittedClinicalSourceChange } from '../services/assistantClinicalSourceChange.service.js';
import ClinicalSession from '../models/clinical/ClinicalSession.model.js';
import ClinicalNote from '../models/clinical/ClinicalNote.model.js';
import ClinicalClaim from '../models/clinical/ClinicalClaim.model.js';
import ClinicalTreatmentPlan from '../models/clinical/ClinicalTreatmentPlan.model.js';
import ClinicalTreatmentObjectiveRating, {
  computeProgressLabel
} from '../models/clinical/ClinicalTreatmentObjectiveRating.model.js';
import {
  upsertPrimaryClinicalDiagnosis,
  upsertClinicalDiagnosis,
  getPrimaryClinicalDiagnosis,
  attachDiagnosisToTreatmentPlan,
  attachDiagnosisToClinicalNote
} from '../services/clinicalDiagnosisAttach.service.js';
import {
  evaluateClaimReadiness,
  resolveClaimDiagnosisCodes,
  resolveClaimDateOfService
} from '../services/clinicalClaimReadiness.service.js';
import AgencyClaimMdCredentials from '../models/AgencyClaimMdCredentials.model.js';
import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import { collectChartScope } from '../utils/noteAidClientAgency.js';
import { getMedicalBillingFlags } from '../services/medicalBillingFlags.service.js';
import { maybeEncryptNotePayload, maybeDecryptNotePayload } from '../services/clinicalNoteCrypto.service.js';
import { encryptChatText, isChatEncryptionConfigured } from '../services/chatEncryption.service.js';
import { getClientIpAddress } from '../utils/ipAddress.util.js';
import {
  uploadClaims,
  fetchEraList
} from '../services/claimMd.service.js';
import pool from '../config/database.js';
import { recordSignedTermination, validateTermination, validateTerminationContent } from '../services/noteAidTermination.service.js';
import NoteAidWorkQueueItem from '../models/NoteAidWorkQueueItem.model.js';

import AgencyMedicalServiceCode from '../models/AgencyMedicalServiceCode.model.js';
import AgencyServiceLocation from '../models/AgencyServiceLocation.model.js';
import OfficeLocation from '../models/OfficeLocation.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import ClinicalInterventionCatalog from '../models/ClinicalInterventionCatalog.model.js';
import ActivityLogService from '../services/activityLog.service.js';
import {
  buildMedicaid8MinuteBands,
  resolveWithOverflowChain,
  ruleFromMedicalServiceCodeRow
} from '../services/serviceCodeUnits.service.js';
import {
  getMedicalBillingReportCatalogWithAvailability as getBillingReportCatalog,
  runMedicalBillingReport as executeBillingReport
} from '../services/medicalBillingReports.service.js';
import { listBillingEncountersForClient } from '../services/billingReportIngest.service.js';
import SupervisorAssignment from '../models/SupervisorAssignment.model.js';
import { resolveDocumentationPolicy, resolveNoteDocumentationPolicy, isNonBillableDocument, normalizeNoteType, requiredDocumentReviewTypes, hasCurrentSupervisorCosign, hasClinicalAmendments, documentReviewRequirement } from '../services/supervisedBillingPolicy.service.js';
import { loadReviewDocument, formatNoteEntriesForExport } from '../services/clinicalReviewDocument.service.js';
import { assertNarrivaRiskBeforeSignature } from '../services/narrivaRiskAssessment.service.js';
import { assertNoPendingClinicalServiceChange } from '../utils/clinicalServiceChangePolicy.js';

async function completeNoteAidSigningWorkflow(note) {
  await recordSignedTermination(note);
  const meta = typeof note.metadata_json === 'string' ? JSON.parse(note.metadata_json) : note.metadata_json || {};
  if (String(note.note_type).toUpperCase() === 'TERMINATION' || meta.treatmentRecommendation !== 'terminate') return null;
  if (!['now', 'after_progress', 'later'].includes(meta.terminationNextStep)) return null;
  const key = String(meta.terminationTodoKey || `termination_after_note_${note.id}`);
  const existing = await NoteAidWorkQueueItem.findByClientKeyForUser({ clientKey: key, userId: note.created_by_user_id });
  if (existing) {
    if (Number(existing.clientId) !== Number(note.client_id) || Number(existing.agencyId) !== Number(note.agency_id) || existing.noteKind !== 'termination') {
      throw new Error('The termination to-do does not match this client and agency.');
    }
    return existing;
  }
  const [clients] = await pool.execute('SELECT full_name FROM clients WHERE id = ?', [note.client_id]);
  const [items] = await NoteAidWorkQueueItem.appendForUser(note.created_by_user_id, [{
    id: key, agencyId: note.agency_id, clientId: note.client_id,
    clientName: clients[0]?.full_name || '',
    noteKind: 'termination', action: 'Review and complete termination note',
    date: meta.dateOfService || new Date().toISOString().slice(0, 10), status: 'not_started'
  }]);
  return items;
}
function parseIntValue(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function contentHash(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function formatAttestationClock(iso) {
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return String(iso || '');
    const date = d.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'numeric', day: 'numeric', year: 'numeric' });
    const time = d.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' });
    return `${date} at ${time} UTC`;
  } catch {
    return String(iso || '');
  }
}

function isProgressClinicalNote(note, meta = {}) {
  const blob = [
    note?.note_type,
    note?.title,
    meta?.noteType,
    meta?.toolId,
    meta?.aidId,
    meta?.selectedAidId
  ].map((v) => String(v || '').toLowerCase()).join(' ');
  if (/treatment\s*plan/.test(blob)) return false;
  return /progress/.test(blob) || /soap/.test(blob) || /cs.?note/.test(blob);
}

function treatmentPlanAgeDays(plan) {
  const raw = plan?.effective_date || plan?.effectiveDate || plan?.updated_at || plan?.created_at;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

async function loadTreatmentPlanMaxAgeDays(agencyId) {
  const aid = Number(agencyId || 0);
  if (!aid) return 90;
  try {
    const [rows] = await pool.execute(
      `SELECT treatment_plan_max_age_days FROM agencies WHERE id = ? LIMIT 1`,
      [aid]
    );
    const n = Number(rows?.[0]?.treatment_plan_max_age_days);
    return Number.isFinite(n) && n > 0 ? n : 90;
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR') return 90;
    throw e;
  }
}

async function listNoteAddenda(noteId) {
  try {
    const [rows] = await clinicalPool.execute(
      `SELECT id, clinical_note_id, agency_id, client_id, body, created_by_user_id, created_at, entry_kind, entry_reason, author_signed_at
       FROM clinical_note_addenda
       WHERE clinical_note_id = ?
       ORDER BY created_at ASC, id ASC`,
      [noteId]
    );
    return (rows || []).map(row => ({...row,body:maybeDecryptNotePayload(row.body)}));
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return [];
    throw e;
  }
}

async function insertBillingAmendment({
  sessionId = null,
  noteId = null,
  agencyId,
  userId,
  fieldKey,
  fromValue,
  toValue,
  reason = null
}) {
  try {
    await clinicalPool.execute(
      `INSERT INTO clinical_billing_amendments
         (clinical_session_id, clinical_note_id, agency_id, changed_by_user_id, field_key, from_value, to_value, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId || null,
        noteId || null,
        agencyId,
        userId,
        String(fieldKey || '').slice(0, 64),
        fromValue != null ? String(fromValue).slice(0, 500) : null,
        toValue != null ? String(toValue).slice(0, 500) : null,
        reason ? String(reason).slice(0, 500) : null
      ]
    );
  } catch (e) {
    if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
  }
}

/**
 * Pending clinical cosign for chart display.
 * A leftover signoff row is not enough — the provider must currently have a
 * different person as their clinical supervisor.
 */
async function mapPendingSupervisorCosign(notes = []) {
  const list = Array.isArray(notes) ? notes : [];
  const ids = [...new Set(list.map((n) => Number(n?.id)).filter((n) => Number.isInteger(n) && n > 0))];
  const map = new Map();
  if (!ids.length) return map;
  let signoffRows = [];
  try {
    const [rows] = await pool.execute(
      `SELECT clinical_note_id, provider_user_id, supervisor_user_id
       FROM clinical_note_signoffs
       WHERE status = 'awaiting_supervisor'
         AND clinical_note_id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    signoffRows = rows || [];
  } catch {
    return map;
  }
  const pendingByNote = new Set();
  for (const r of signoffRows) {
    const supervisorId = Number(r.supervisor_user_id || 0);
    const providerId = Number(r.provider_user_id || 0);
    if (supervisorId > 0 && supervisorId !== providerId) {
      pendingByNote.add(Number(r.clinical_note_id));
    }
  }
  const needsCosignByProvider = new Map();
  for (const n of list) {
    const noteId = Number(n.id);
    if (!pendingByNote.has(noteId)) {
      map.set(noteId, false);
      continue;
    }
    const uid = Number(n.created_by_user_id || n.provider_signed_by_user_id || 0);
    const agencyId = Number(n.agency_id || 0);
    const key = `${uid}:${agencyId}`;
    if (!needsCosignByProvider.has(key)) {
      let needs = false;
      if (uid && agencyId) {
        try {
          const assignments = await SupervisorAssignment.findBySupervisee(uid, agencyId);
          needs = !!SupervisorAssignment.pickClinicalCosignSupervisor(assignments, uid);
        } catch {
          needs = false;
        }
      }
      needsCosignByProvider.set(key, needs);
    }
    map.set(noteId, !!needsCosignByProvider.get(key));
  }
  return map;
}

async function loadAgencyFlags(agencyId) {
  const [rows] = await pool.execute('SELECT id, feature_flags FROM agencies WHERE id = ?', [agencyId]);
  return rows?.[0] || null;
}

export const getMedicalBillingStatus = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId || req.params.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const agency = await loadAgencyFlags(agencyId);
    const flags = getMedicalBillingFlags(agency);
    const claimMd = flags.claimMdEnabled && await hasSchedulingBillingAccess(req.user, agencyId) ? await claimMdConnectionMeta(agencyId) : { configured: false };
    return res.json({ flags, claimMd });
  } catch (e) {
    next(e);
  }
};

/** Load a single treatment plan (goals/objectives) for Documentation Hub draft editor. */
export const getTreatmentPlanById = async (req, res, next) => {
  try {
    const planId = parseIntValue(req.params.planId);
    const agencyId = parseIntValue(req.query.agencyId);
    const clientId = parseIntValue(req.query.clientId);
    if (!planId || !agencyId || !clientId) {
      return res.status(400).json({ error: { message: 'planId, agencyId, and clientId are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const plan = await ClinicalTreatmentPlan.findById(planId);
    if (!plan || Number(plan.agency_id) !== agencyId || Number(plan.client_id) !== clientId) {
      return res.status(404).json({ error: { message: 'Treatment plan not found' } });
    }
    await logNoteAidChartEvent(req, { clientId, agencyId, action: 'clinical_treatment_plan_viewed', metadata: { treatmentPlanId: plan.id } });
    return res.json({ plan });
  } catch (e) {
    next(e);
  }
};

/** Save structured treatment plan + optional note payload to chart (requires clinicalChartEnabled). */
export const saveTreatmentPlanToChart = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
    }
    const agencyId = parseIntValue(req.body.agencyId);
    const clientId = parseIntValue(req.body.clientId);
    const sessionId = parseIntValue(req.body.clinicalSessionId);
    if (!agencyId || !clientId) {
      return res.status(400).json({ error: { message: 'agencyId and clientId are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });

    if (req.body.historicalImport != null) {
      const { importHistoricalPlan } = await import('../services/ehrHistoricalPlanImport.service.js');
      const result = await importHistoricalPlan({ user: req.user, agencyId, clientId, input: req.body });
      await logNoteAidChartEvent(req, { clientId, agencyId, action: 'treatment_plan_saved', metadata: { planId: result.plan?.id, historicalImport: true, reused: result.reused } });
      return res.status(result.reused ? 200 : 201).json(result);
    }

    const requestedStatus = String(req.body.status || 'active').trim().toLowerCase();
    const finalizeRequested = req.body.finalize === true || req.body.finalize === 1
      || requestedStatus === 'active' || requestedStatus === 'final';
    // A reviewed, individualized starter plan can precede the full intake.
    if (finalizeRequested && !isReviewedStarterPlan(req.body)) {
      const ClientIntakeNoteDraft = (await import('../models/ClientIntakeNoteDraft.model.js')).default;
      const hasFinalIntake = await ClientIntakeNoteDraft.hasFinalizedForClient({ clientId, agencyId })
        || await ClinicalNote.hasSignedIntakeForClient({ clientId, agencyId });
      if (!hasFinalIntake) {
        return res.status(409).json({
          error: {
            message: 'Finalize the intake note before finalizing the treatment plan.',
            code: 'intake_not_finalized'
          }
        });
      }
    }

    let clinicalSessionId = sessionId;
    if (!clinicalSessionId && parseIntValue(req.body.officeEventId)) {
      const session = await ClinicalSession.upsert({
        agencyId,
        clientId,
        officeEventId: parseIntValue(req.body.officeEventId),
        providerUserId: req.user.id,
        createdByUserId: req.user.id
      });
      clinicalSessionId = session?.id || null;
    }

    const goals = Array.isArray(req.body.goals) ? req.body.goals : [];

    let primaryDiagnosisId = parseIntValue(req.body.primaryDiagnosisId);
    let diagnosticJustification = req.body.diagnosticJustification
      ? String(req.body.diagnosticJustification).trim()
      : null;

    // Session/claim-attached plans require a primary diagnosis on file.
    const sessionAttached = !!(clinicalSessionId || parseIntValue(req.body.officeEventId));
    if (!primaryDiagnosisId) {
      const primary = await getPrimaryClinicalDiagnosis({ agencyId, clientId });
      if (primary) {
        primaryDiagnosisId = primary.id;
        if (!diagnosticJustification && primary.justification) {
          diagnosticJustification = String(primary.justification);
        }
      }
    }
    if (sessionAttached && !primaryDiagnosisId) {
      return res.status(400).json({
        error: {
          message:
            'Primary diagnosis is required before saving a session-linked treatment plan. Finalize an intake note or add a diagnosis on the chart first.'
        }
      });
    }

    // Allow creating/updating primary dx inline from Documentation Hub
    if (!primaryDiagnosisId && req.body.icd10Code) {
      primaryDiagnosisId = await upsertPrimaryClinicalDiagnosis({
        agencyId,
        clientId,
        icd10Code: req.body.icd10Code,
        description: req.body.diagnosisDescription || null,
        justification: diagnosticJustification,
        createdByUserId: req.user.id,
        clinicalSessionId: clinicalSessionId || null,
        forceOverwrite: true
      });
    }

    let plan = await ClinicalTreatmentPlan.create({
      agencyId,
      clientId,
      clinicalSessionId: clinicalSessionId || null,
      clinicalNoteId: parseIntValue(req.body.clinicalNoteId),
      title: String(req.body.title || 'Treatment Plan').trim(),
      status: requestedStatus === 'draft' ? 'draft' : 'active',
      effectiveDate: req.body.effectiveDate || req.body.effective_date || null,
      dischargePlan: req.body.dischargePlan ? String(req.body.dischargePlan) : null,
      presentingProblem: req.body.presentingProblem || null,
      prescribedFrequency: req.body.prescribedFrequency || null,
      sourceToolId: req.body.sourceToolId ? String(req.body.sourceToolId) : null,
      createdByUserId: req.user.id,
      primaryDiagnosisId,
      diagnosticJustification,
      goals: goals.map((g, i) => ({
        goalIndex: g.goalIndex || i + 1,
        goalText: String(g.goalText || g.text || ''),
        projectedCompletion: g.projectedCompletion || null,
        objectives: (g.objectives || []).map((o, j) => ({
          objectiveIndex: o.objectiveIndex || j + 1,
          objectiveText: String(o.objectiveText || o.text || ''),
          scaleCurrent: o.scaleCurrent ?? null,
          scaleTarget: o.scaleTarget ?? null,
          scaleDirection:
            o.scaleDirection === 'increase' || o.scaleDirection === 'decrease'
              ? o.scaleDirection
              : null,
          measurementMethod: o.measurementMethod || null,
          interventions: Array.isArray(o.interventions) ? o.interventions : []
        }))
      }))
    });

    try {
      const { fillEmptyKioskPrompts } = await import('../services/kioskObjectivePrompt.service.js');
      const prompts = await fillEmptyKioskPrompts({ objectives: plan.goals.flatMap((g) => g.objectives || []) });
      for (const row of prompts) await ClinicalTreatmentPlan.updateObjectiveKioskPrompts(row.id, { kioskPrompt: row.kiosk_prompt, kioskPromptOther: row.kiosk_prompt_other });
      plan = await ClinicalTreatmentPlan.findById(plan.id);
    } catch { /* A saved plan stays saved; questions can be retried from its chart panel. */ }

    // Client setup: importing/finalizing a plan replaces intake-packet bootstrap drafts.
    const sourceTool = String(req.body.sourceToolId || '').trim();
    if (sourceTool === 'note_aid_plan_import' || requestedStatus !== 'draft') {
      try {
        await ClinicalTreatmentPlan.voidPacketBootstrapDrafts({
          agencyId,
          clientId,
          exceptPlanId: plan?.id || null
        });
      } catch (voidErr) {
        console.warn('[treatment-plans] void bootstrap drafts failed', voidErr?.message || voidErr);
      }
    }

    if (plan?.id && primaryDiagnosisId) {
      await attachDiagnosisToTreatmentPlan({
        planId: plan.id,
        primaryDiagnosisId,
        diagnosticJustification
      });
    }

    // Ordered multi-diagnosis list from import review — plan fields always win over intake.
    const planDxList = Array.isArray(req.body.diagnoses) ? req.body.diagnoses : [];
    if (plan?.id && planDxList.length) {
      const linked = [];
      for (let i = 0; i < planDxList.length; i += 1) {
        const d = planDxList[i];
        const code = String(d.icd10Code || d.icd10_code || '').trim();
        if (!code) continue;
        const makePrimary = i === 0 || d.isPrimary === true;
        const diagnosisId = await upsertClinicalDiagnosis({
          agencyId,
          clientId,
          icd10Code: code,
          description: d.description || null,
          justification: d.justification || diagnosticJustification,
          createdByUserId: req.user.id,
          clinicalSessionId: clinicalSessionId || null,
          setPrimary: makePrimary,
          forceOverwrite: true
        });
        linked.push({
          diagnosisId,
          sortOrder: i + 1,
          isPrimary: makePrimary,
          justification: d.justification || null
        });
      }
      if (linked.length) {
        await ClinicalTreatmentPlan.replacePlanDiagnoses({
          planId: plan.id,
          diagnoses: linked,
          primaryDiagnosisId: linked.find((x) => x.isPrimary)?.diagnosisId || primaryDiagnosisId
        });
      }
    }

    const refreshed = plan?.id ? await ClinicalTreatmentPlan.findById(plan.id) : plan;
    try {
      const { logNoteAidChartEvent } = await import('../services/noteAidChartAudit.service.js');
      await logNoteAidChartEvent(req, {
        clientId,
        agencyId,
        action: planDxList.length ? 'treatment_plan_diagnoses_updated' : 'treatment_plan_saved',
        metadata: { planId: refreshed?.id || plan?.id, primaryDiagnosisId }
      });
    } catch {
      // best-effort
    }
    const guardianSharing = await shareSavedPlanToGuardians(refreshed, req.user.id);
    return res.status(201).json({ plan: refreshed, primaryDiagnosisId: primaryDiagnosisId || null, guardianSharing });
  } catch (e) {
    next(e);
  }
};

/** Discard a chart treatment-plan draft (not a Documentation Hub clinical_note_drafts row). */
export const discardTreatmentPlanDraft = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    const clientId = parseIntValue(req.body.clientId);
    const planId = parseIntValue(req.params.planId);
    if (!agencyId || !clientId || !planId) {
      return res.status(400).json({ error: { message: 'agencyId, clientId, and planId are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const plan = await ClinicalTreatmentPlan.discardDraft({ planId, agencyId, clientId });
    if (!plan) return res.status(404).json({ error: { message: 'Treatment plan not found' } });
    return res.json({ plan });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const getClaimBillingMode = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const { getProviderClaimBillingMode } = await import('../services/resolveClaimProviders.service.js');
    const data = await getProviderClaimBillingMode({
      agencyId,
      providerUserId: Number(req.query.userId || req.user.id)
    });
    return res.json({
      mode: data.mode,
      billingSupervisorUserId: data.billingSupervisorUserId,
      preferredSupervisorUserId: data.preferredSupervisorUserId,
      supervisors: data.supervisors || []
    });
  } catch (e) {
    next(e);
  }
};

export const updateClaimBillingMode = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const { setProviderClaimBillingMode } = await import('../services/resolveClaimProviders.service.js');
    const data = await setProviderClaimBillingMode({
      agencyId,
      providerUserId: Number(req.body.userId || req.user.id),
      mode: req.body.mode,
      billingSupervisorUserId: req.body.billingSupervisorUserId !== undefined
        ? req.body.billingSupervisorUserId
        : req.body.preferredSupervisorUserId
    });
    return res.json({
      mode: data.mode,
      billingSupervisorUserId: data.billingSupervisorUserId,
      preferredSupervisorUserId: data.preferredSupervisorUserId,
      supervisors: data.supervisors || []
    });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

/** Client-setup only: eradicate intake-packet bootstrap treatment plan drafts. */
export const voidPacketBootstrapTreatmentPlanDrafts = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    const clientId = parseIntValue(req.body.clientId);
    if (!agencyId || !clientId) {
      return res.status(400).json({ error: { message: 'agencyId and clientId are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const voided = await ClinicalTreatmentPlan.voidPacketBootstrapDrafts({
      agencyId,
      clientId,
      exceptPlanId: parseIntValue(req.body.exceptPlanId)
    });
    return res.json({ voided });
  } catch (e) {
    next(e);
  }
};

/** Parse pasted treatment plan text into a review model (no persistence). */
export const parseTreatmentPlanImport = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    // Parsing only structures submitted text; standalone library plans have no client yet.
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const { parseTreatmentPlanText } = await import('../services/treatmentPlanImport.service.js');
    const parsed = parseTreatmentPlanText(req.body.text || req.body.planText || '');
    return res.json({ parsed });
  } catch (e) {
    next(e);
  }
};

/** Suggest a 1–10 scale rewrite for an imported objective (auto-applied in UI; clinician can still edit). */
export const normalizeTreatmentPlanObjective = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    const clientId = parseIntValue(req.body.clientId);
    if (!agencyId || !clientId) {
      return res.status(400).json({ error: { message: 'agencyId and clientId are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const objectiveText = String(req.body.objectiveText || '').trim();
    if (!objectiveText) {
      return res.status(400).json({ error: { message: 'objectiveText is required' } });
    }
    const clinicianInstructions = String(req.body.clinicianInstructions || req.body.instructions || '').trim();
    const { suggestObjectiveScaleRewrite } = await import(
      '../services/treatmentPlanObjectiveNormalize.service.js'
    );
    const suggestion = await suggestObjectiveScaleRewrite(objectiveText, { clinicianInstructions });
    if (!suggestion) {
      return res.status(502).json({ error: { message: 'Could not generate a 1–10 scale suggestion' } });
    }
    return res.json({ suggestion });
  } catch (e) {
    next(e);
  }
};

/** Suggest discharge criteria / planning when missing from an imported plan. */
export const suggestTreatmentPlanDischarge = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    const clientId = parseIntValue(req.body.clientId);
    if (!agencyId || !clientId) {
      return res.status(400).json({ error: { message: 'agencyId and clientId are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const { suggestDischargeCriteria } = await import(
      '../services/treatmentPlanObjectiveNormalize.service.js'
    );
    const suggestion = await suggestDischargeCriteria({
      presentingProblem: req.body.presentingProblem,
      diagnoses: req.body.diagnoses,
      goals: req.body.goals,
      prescribedFrequency: req.body.prescribedFrequency
    });
    if (!suggestion?.dischargePlan) {
      return res.status(502).json({ error: { message: 'Could not generate discharge criteria' } });
    }
    return res.json({ suggestion });
  } catch (e) {
    next(e);
  }
};

/** Session-aware treatment plan update proposal (provider must review/confirm). */
export const proposeTreatmentPlanUpdate = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    const clientId = parseIntValue(req.body.clientId);
    if (!agencyId || !clientId) {
      return res.status(400).json({ error: { message: 'agencyId and clientId are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const { proposeTreatmentPlanUpdate: propose } = await import(
      '../services/treatmentPlanUpdater.service.js'
    );
    const planId = Number(req.body.currentPlan?.id || req.body.planId || 0);
    const plan = planId ? await ClinicalTreatmentPlan.findById(planId) : null;
    if (!plan || Number(plan.agency_id) !== agencyId || Number(plan.client_id) !== clientId) return res.status(404).json({ error: { message: 'Treatment plan not found for this client and agency.' } });
    const edits = req.body.currentPlan || {};
    const knownObjectives = new Map((plan.goals || []).flatMap((g) => (g.objectives || []).map((o) => [Number(o.id), o])));
    const currentPlan = { ...plan, ...edits, id: plan.id, client_id: plan.client_id, agency_id: plan.agency_id,
      goals: Array.isArray(edits.goals) ? edits.goals.map((g) => ({ ...g, objectives: (g.objectives || []).map((o) => ({ ...knownObjectives.get(Number(o.id)), ...o, id: knownObjectives.has(Number(o.id)) ? Number(o.id) : null, content_fingerprint: knownObjectives.get(Number(o.id))?.content_fingerprint, scale_start: knownObjectives.get(Number(o.id))?.scale_start })) })) : plan.goals };
    const result = await propose({
      agencyId,
      clientId,
      currentPlan,
      providerNarrative: req.body.providerNarrative || req.body.narrative || '',
      pasteRewriteSource: req.body.pasteRewriteSource || req.body.pasteText || '',
      progressExcerpt: req.body.progressExcerpt || '',
      renewalReason: req.body.renewalReason || '',
      sinceDate: req.body.sinceDate || null
    });
    return res.json(result);
  } catch (e) {
    next(e);
  }
};

export const listClientChart = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    const clientId = parseIntValue(req.params.clientId);
    if (!agencyId || !clientId) {
      return res.status(400).json({ error: { message: 'agencyId and clientId are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });

    const scope = req.auricwellPreview
      ? { clientIds: [clientId], agencyIds: [agencyId] }
      : await collectChartScope({ clientId, agencyId });
    const chartAgencyIds = scope.agencyIds.length ? scope.agencyIds : [agencyId];
    const chartClientIds = scope.clientIds.length ? scope.clientIds : [clientId];
    const agencyIn = chartAgencyIds.map(() => '?').join(',');
    const clientIn = chartClientIds.map(() => '?').join(',');

    let notes = [];
    try {
      const [noteRows] = await clinicalPool.execute(
        `SELECT n.id, n.clinical_session_id, n.title, n.note_type, n.version_number, n.provider_signed_at, n.supervisor_cosigned_at,
                n.is_billable, n.created_at, n.updated_at, n.created_by_user_id, n.agency_id,
                n.content_review_status, n.content_review_source,
                cs.service_code AS session_service_code
         FROM clinical_notes n
         LEFT JOIN clinical_sessions cs ON cs.id = n.clinical_session_id
         WHERE n.client_id IN (${clientIn}) AND n.is_deleted = 0 AND n.agency_id IN (${agencyIn})
         ORDER BY n.created_at DESC
         LIMIT 200`,
        [...chartClientIds, ...chartAgencyIds]
      );
      notes = noteRows || [];
    } catch (e) {
      if (!String(e?.message || '').includes('Unknown column') && e.code !== 'ER_BAD_FIELD_ERROR') throw e;
      const [noteRows] = await clinicalPool.execute(
        `SELECT n.id, n.clinical_session_id, n.title, n.note_type, n.version_number, n.provider_signed_at, n.supervisor_cosigned_at,
                n.is_billable, n.created_at, n.updated_at, n.created_by_user_id, n.agency_id,
                cs.service_code AS session_service_code
         FROM clinical_notes n
         LEFT JOIN clinical_sessions cs ON cs.id = n.clinical_session_id
         WHERE n.client_id IN (${clientIn}) AND n.is_deleted = 0 AND n.agency_id IN (${agencyIn})
         ORDER BY n.created_at DESC
         LIMIT 200`,
        [...chartClientIds, ...chartAgencyIds]
      );
      notes = noteRows || [];
    }
    const plans = await ClinicalTreatmentPlan.listByClient({ agencyId, clientId });
    const {
      pickAuthoritativeTreatmentPlan,
      resolvePrimaryDiagnosisForChart,
      presentingProblemFromPlan,
      isIntakeAutoTreatmentPlan
    } = await import('../services/treatmentPlanPrecedence.service.js');
    const authoritativeMeta = pickAuthoritativeTreatmentPlan(plans);
    // Prefer authoritative (imported) plan over a newer empty intake auto-draft.
    let latestPlanId = Number(authoritativeMeta?.id || 0);
    if (!latestPlanId && plans?.length) {
      const withGoals = plans.find((p) => !isIntakeAutoTreatmentPlan(p));
      latestPlanId = Number(withGoals?.id || 0);
    }
    const latestPlan = latestPlanId > 0 ? await ClinicalTreatmentPlan.findById(latestPlanId) : null;
    let diagnoses = [];
    try {
      const [dxRows] = await clinicalPool.execute(
        `SELECT id, icd10_code, description, concern_kind, justification, is_primary, is_active, onset_date, created_at
         FROM clinical_diagnoses
         WHERE agency_id = ? AND client_id = ?
         ORDER BY is_active DESC, is_primary DESC, created_at DESC
         LIMIT 100`,
        [agencyId, clientId]
      );
      diagnoses = dxRows || [];
    } catch (e) {
      if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
      try {
        const [dxRows] = await clinicalPool.execute(
          `SELECT id, icd10_code, description, justification, is_primary, is_active, onset_date, created_at
           FROM clinical_diagnoses
           WHERE agency_id = ? AND client_id = ?
           ORDER BY is_active DESC, is_primary DESC, created_at DESC
           LIMIT 100`,
          [agencyId, clientId]
        );
        diagnoses = dxRows || [];
      } catch (e2) {
        if (e2.code !== 'ER_BAD_FIELD_ERROR') throw e2;
        const [dxRows] = await clinicalPool.execute(
          `SELECT id, icd10_code, description, is_primary, is_active, onset_date, created_at
           FROM clinical_diagnoses
           WHERE agency_id = ? AND client_id = ?
           ORDER BY is_active DESC, is_primary DESC, created_at DESC
           LIMIT 100`,
          [agencyId, clientId]
        );
        diagnoses = dxRows || [];
      }
    }

    // Align chart diagnosis primary flag + justification with treatment plan when present.
    const resolvedPrimary = resolvePrimaryDiagnosisForChart({ diagnoses, plan: latestPlan });
    if (resolvedPrimary?.id) {
      const primaryId = Number(resolvedPrimary.id);
      diagnoses = (diagnoses || []).map((d) => ({
        ...d,
        is_primary: Number(d.id) === primaryId ? 1 : 0,
        // Each diagnosis retains its own justification.
        justification:
          Number(d.id) === primaryId
            ? (resolvedPrimary.justification || d.justification)
            : d.justification
      }));
    }

    const presentingProblem = presentingProblemFromPlan(latestPlan);
    const [sessions] = await clinicalPool.execute(
      `SELECT id, office_event_id, encounter_status, place_of_service, service_code, duration_minutes, is_telehealth,
              rendering_provider_user_id, scheduled_start_at, scheduled_end_at, created_at, agency_id
       FROM clinical_sessions
       WHERE client_id IN (${clientIn}) AND agency_id IN (${agencyIn})
       ORDER BY COALESCE(scheduled_start_at, created_at) DESC
       LIMIT 100`,
      [...chartClientIds, ...chartAgencyIds]
    );

    let billingEncounters = [];
    try {
      billingEncounters = await listBillingEncountersForClient({
        agencyId,
        agencyIds: chartAgencyIds,
        clientId,
        clientIds: chartClientIds,
        limit: 200
      });
    } catch {
      billingEncounters = [];
    }
    billingEncounters = await Promise.all(billingEncounters.map((encounter) =>
      schedulingResponseForUser(req.user, Number(encounter.agency_id || encounter.agencyId || agencyId), encounter)));

    let objectiveRatings = [];
    try {
      objectiveRatings = await ClinicalTreatmentObjectiveRating.listByClient({
        agencyId,
        clientId,
        limit: 100
      });
    } catch {
      objectiveRatings = [];
    }

    let noteAidDrafts = [];
    try {
      noteAidDrafts = await ClinicalNoteDraft.listForClient({
        clientId,
        clientIds: chartClientIds,
        agencyId,
        agencyIds: chartAgencyIds,
        limit: 100
      });
      noteAidDrafts = (noteAidDrafts || []).map((d) => ({
        id: d.id,
        service_code: d.service_code,
        date_of_service: d.date_of_service,
        initials: d.initials,
        created_at: d.created_at,
        updated_at: d.updated_at,
        office_event_id: d.office_event_id || null,
        clinical_session_id: d.clinical_session_id || null,
        has_output: !!(d.output_json && String(d.output_json).length > 2),
        author_name: [d.author_first_name, d.author_last_name].filter(Boolean).join(' ').trim() || null
      }));
    } catch {
      noteAidDrafts = [];
    }

    let intakeNotes = [];
    try {
      const ClientIntakeNoteDraft = (await import('../models/ClientIntakeNoteDraft.model.js')).default;
      const latest = await ClientIntakeNoteDraft.latestForClient({ clientId, agencyId });
      if (latest) {
        intakeNotes = [
          {
            id: latest.id,
            status: latest.status,
            service_code: latest.service_code,
            created_at: latest.created_at,
            updated_at: latest.updated_at,
            finalized_at: latest.finalized_at || null
          }
        ];
      }
    } catch {
      intakeNotes = [];
    }

    const pendingCosign = await mapPendingSupervisorCosign(notes || []);
    const notesOut = (notes || []).map((n) => {
      const nt = String(n.note_type || n.title || '').toUpperCase();
      const reviewOnly = nt.includes('TERMINATION') || nt.includes('CONTACT') || ['MISSED_APPOINTMENT','NO_SHOW'].includes(nt);
      return {
        ...n,
        needs_supervisor_cosign: reviewOnly ? false : !!pendingCosign.get(Number(n.id)),
        content_review_status: n.content_review_status || null,
        content_review_source: n.content_review_source || null,
        review_only: reviewOnly
      };
    });

    let contactNotes = [];
    try {
      const ClientNotes = (await import('../models/ClientNotes.model.js')).default;
      const allClientNotes = await ClientNotes.findByClientId(clientId, {
        hasAgencyAccess: true,
        canViewInternalNotes: true
      });
      contactNotes = (allClientNotes || [])
        .filter((cn) => String(cn.category || '').toLowerCase() === 'contact')
        .slice(0, 100)
        .map((cn) => ({
          id: cn.id,
          category: cn.category,
          message: cn.message,
          author_name: cn.author_name || null,
          created_at: cn.created_at,
          updated_at: cn.updated_at,
          is_internal_only: cn.is_internal_only
        }));
    } catch {
      contactNotes = [];
    }

    await logNoteAidChartEvent(req, { clientId, agencyId, action: 'clinical_record_viewed' });
    return res.json(await schedulingResponseForUser(req.user, agencyId, {
      notes: notesOut,
      plans: (plans || []).filter((p) => !isIntakeAutoTreatmentPlan(p)),
      latestPlan: latestPlan || null,
      diagnoses: diagnoses || [],
      diagnosisAlerts: await listClientDiagnosisAlerts({agencyId,clientId}),
      presentingProblem: presentingProblem || null,
      sessions: sessions || [],
      billingEncounters,
      objectiveRatings,
      noteAidDrafts,
      intakeNotes,
      contactNotes,
      treatmentPlanMaxAgeDays: await loadTreatmentPlanMaxAgeDays(agencyId),
      treatmentPlanRenewalPolicy: await loadRenewalPolicy(agencyId)
    }));
  } catch (e) {
    next(e);
  }
};

export const createObjectiveRating = async (req, res, next) => {
  try {
    requireStaffPlanActor(req.user);
    const objectiveId = parseIntValue(req.params.objectiveId);
    const agencyId = parseIntValue(req.body.agencyId);
    const clientId = parseIntValue(req.body.clientId);
    if (!objectiveId || !agencyId || !clientId) {
      return res.status(400).json({ error: { message: 'objectiveId, agencyId, and clientId are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });

    const [objRows] = await clinicalPool.execute(
      `SELECT o.*, g.treatment_plan_id, g.id AS goal_id, p.agency_id, p.client_id
       FROM clinical_treatment_plan_objectives o
       INNER JOIN clinical_treatment_plan_goals g ON g.id = o.goal_id
       INNER JOIN clinical_treatment_plans p ON p.id = g.treatment_plan_id
       WHERE o.id = ?
       LIMIT 1`,
      [objectiveId]
    );
    const objective = objRows?.[0];
    if (!objective) {
      return res.status(404).json({ error: { message: 'Objective not found' } });
    }
    if (Number(objective.agency_id) !== agencyId || Number(objective.client_id) !== clientId) {
      return res.status(403).json({ error: { message: 'Objective does not belong to this client' } });
    }

    const disposition = String(req.body.disposition || 'rated').trim().toLowerCase();
    const allowed = new Set(['rated', 'deferred', 'on_hold', 'not_addressed']);
    if (!allowed.has(disposition)) {
      return res.status(400).json({ error: { message: 'Invalid disposition' } });
    }

    let scaleValue = null;
    if (disposition === 'rated') {
      scaleValue = Number(req.body.scaleValue);
      if (!Number.isInteger(scaleValue) || scaleValue < 1 || scaleValue > 10) {
        return res.status(400).json({ error: { message: 'scaleValue must be an integer 1–10' } });
      }
    }

    const target =
      req.body.scaleTarget != null
        ? Number(req.body.scaleTarget)
        : objective.scale_target != null
          ? Number(objective.scale_target)
          : null;
    const raterKind = req.body.raterKind || req.body.rater_kind || 'clinician';
    const dateOfService = req.body.dateOfService ? String(req.body.dateOfService).slice(0, 10) : null;
    const previous = await ClinicalTreatmentObjectiveRating.findPreviousSession({
      objectiveId, raterKind, dateOfService, raterLabel: req.body.raterLabel || req.body.rater_label || null
    });
    const progressLabel = disposition === 'rated'
      ? computeProgressLabel({ previousValue: previous?.scale_value ?? null, newValue: scaleValue, target }) : null;

    const existing = await ClinicalTreatmentObjectiveRating.findLatestForDedupe({
      objectiveId,
      raterKind,
      dateOfService
    });
    if (existing) {
      const sameDisposition = String(existing.disposition || '') === disposition;
      const sameScale =
        disposition !== 'rated'
          || Number(existing.scale_value) === Number(scaleValue);
      if (sameDisposition && sameScale) {
        return res.status(200).json({
          rating: existing,
          progressLabel: existing.progress_label || progressLabel,
          suggestUpdateTreatmentPlan: false,
          deduped: true
        });
      }
    }

    const rating = await ClinicalTreatmentObjectiveRating.create({
      agencyId,
      clientId,
      objectiveId,
      goalId: objective.goal_id,
      treatmentPlanId: objective.treatment_plan_id,
      ratedByUserId: req.user.id,
      scaleValue,
      scaleTargetAtRating: target,
      disposition,
      progressLabel,
      clinicalNoteId: parseIntValue(req.body.clinicalNoteId),
      draftId: parseIntValue(req.body.draftId),
      dateOfService,
      notes: req.body.notes ? maybeEncryptNotePayload(String(req.body.notes).trim()) : null,
      raterKind,
      raterLabel: req.body.raterLabel || req.body.rater_label || null
    });

    return res.status(201).json({
      rating,
      progressLabel,
      suggestUpdateTreatmentPlan: progressLabel === 'improved'
    });
  } catch (e) {
    next(e);
  }
};

export const listClientObjectiveRatings = async (req, res, next) => {
  try {
    requireStaffPlanActor(req.user);
    const agencyId = parseIntValue(req.query.agencyId);
    const clientId = parseIntValue(req.params.clientId);
    if (!agencyId || !clientId) {
      return res.status(400).json({ error: { message: 'agencyId and clientId are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const ratings = await ClinicalTreatmentObjectiveRating.listByClient({
      agencyId,
      clientId,
      limit: parseIntValue(req.query.limit) || 200
    });
    const guardianIds = [...new Set(ratings.filter(r => r.rater_kind === 'other' && /^guardian:\d+$/.test(String(r.rater_label || '')))
      .map(r => Number(r.rated_by_user_id)).filter(Boolean))];
    let guardianNames = new Map();
    if (guardianIds.length) {
      const [observers] = await pool.execute(`SELECT id,first_name,last_name FROM users WHERE id IN (${guardianIds.map(() => '?').join(',')})`, guardianIds);
      guardianNames = new Map(observers.map(u => [Number(u.id), [u.first_name, u.last_name].filter(Boolean).join(' ')]));
    }
    const reveal = String(req.query.reveal || '') === '1';
    const sanitized = (ratings || []).map((r) => {
      const row = { ...r };
      if (guardianNames.has(Number(row.rated_by_user_id))) row.observer_name = guardianNames.get(Number(row.rated_by_user_id));
      if (row.notes) {
        row.notes = maybeDecryptNotePayload(row.notes);
        if (!reveal) {
          row.notes_present = !!String(row.notes || '').trim();
          row.notes = null;
        }
      }
      return row;
    });
    return res.json({ ratings: sanitized });
  } catch (e) {
    next(e);
  }
};

export const setTreatmentPlanKioskShare = async (req, res, next) => {
  try {
    const planId = parseIntValue(req.params.planId);
    const agencyId = parseIntValue(req.body.agencyId);
    const clientId = parseIntValue(req.body.clientId);
    const enabled = req.body.enabled === true || req.body.enabled === 1 || req.body.enabled === '1';
    if (!planId || !agencyId || !clientId) {
      return res.status(400).json({ error: { message: 'planId, agencyId, and clientId are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const plan = await ClinicalTreatmentPlan.findById(planId);
    if (!plan || Number(plan.agency_id) !== agencyId || Number(plan.client_id) !== clientId) {
      return res.status(404).json({ error: { message: 'Treatment plan not found' } });
    }
    await ClinicalTreatmentPlan.setKioskShare(planId, enabled);

    const objectives = [];
    for (const g of plan.goals || []) {
      for (const o of g.objectives || []) {
        if (o.superseded_at) continue;
        objectives.push(o);
      }
    }

    let prompts = objectives.map((o) => ({
      id: o.id,
      kiosk_prompt: o.kiosk_prompt || null,
      kiosk_prompt_other: o.kiosk_prompt_other || null
    }));

    if (enabled) {
      const Client = (await import('../models/Client.model.js')).default;
      const client = await Client.findById(clientId);
      const clientName = [client?.first_name, client?.last_name].filter(Boolean).join(' ').trim()
        || client?.full_name
        || 'the client';
      const { fillEmptyKioskPrompts } = await import('../services/kioskObjectivePrompt.service.js');
      prompts = await fillEmptyKioskPrompts({ clientName, objectives });
      for (const row of prompts) {
        const existing = objectives.find((o) => Number(o.id) === Number(row.id));
        const clientChanged = String(existing?.kiosk_prompt || '') !== String(row.kiosk_prompt || '');
        const otherChanged = String(existing?.kiosk_prompt_other || '') !== String(row.kiosk_prompt_other || '');
        if (clientChanged || otherChanged) {
          await ClinicalTreatmentPlan.updateObjectiveKioskPrompts(row.id, {
            kioskPrompt: row.kiosk_prompt,
            kioskPromptOther: row.kiosk_prompt_other
          });
        }
      }
    }

    const updated = await ClinicalTreatmentPlan.findById(planId);
    return res.json({ plan: updated, prompts });
  } catch (e) {
    next(e);
  }
};

export const updateTreatmentPlanPrescribedFrequency = async (req, res, next) => {
  try {
    const planId = parseIntValue(req.params.planId);
    const agencyId = parseIntValue(req.body.agencyId);
    const clientId = parseIntValue(req.body.clientId);
    const prescribedFrequency = req.body.prescribedFrequency != null
      ? String(req.body.prescribedFrequency).trim()
      : '';
    if (!planId || !agencyId || !clientId) {
      return res.status(400).json({ error: { message: 'planId, agencyId, and clientId are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const plan = await ClinicalTreatmentPlan.updatePrescribedFrequency({
      planId,
      agencyId,
      clientId,
      prescribedFrequency
    });
    const guardianSharing = await shareSavedPlanToGuardians(plan, req.user.id);
    return res.json({ plan, guardianSharing });
  } catch (e) {
    if (e?.status === 404) {
      return res.status(404).json({ error: { message: e.message || 'Treatment plan not found' } });
    }
    next(e);
  }
};

export const updateObjectiveKioskPrompts = async (req, res, next) => {
  try {
    const objectiveId = parseIntValue(req.params.objectiveId);
    const agencyId = parseIntValue(req.body.agencyId);
    const clientId = parseIntValue(req.body.clientId);
    if (!objectiveId || !agencyId || !clientId) {
      return res.status(400).json({ error: { message: 'objectiveId, agencyId, and clientId are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const [objRows] = await clinicalPool.execute(
      `SELECT o.*, p.agency_id, p.client_id, p.id AS treatment_plan_id
       FROM clinical_treatment_plan_objectives o
       INNER JOIN clinical_treatment_plan_goals g ON g.id = o.goal_id
       INNER JOIN clinical_treatment_plans p ON p.id = g.treatment_plan_id
       WHERE o.id = ?
       LIMIT 1`,
      [objectiveId]
    );
    const objective = objRows?.[0];
    if (!objective || Number(objective.agency_id) !== agencyId || Number(objective.client_id) !== clientId) {
      return res.status(404).json({ error: { message: 'Objective not found' } });
    }
    if (req.body.generate === true) {
      const { fillEmptyKioskPrompts } = await import('../services/kioskObjectivePrompt.service.js');
      const [row] = await fillEmptyKioskPrompts({ objectives: [{ ...objective, kiosk_prompt: null, kiosk_prompt_other: null }] });
      await ClinicalTreatmentPlan.updateObjectiveKioskPrompts(objectiveId, { kioskPrompt: row.kiosk_prompt, kioskPromptOther: row.kiosk_prompt_other });
      return res.json({ objective: { ...objective, ...row, kiosk_prompt_verified_at: null, kiosk_prompt_verified_by: null, kiosk_prompt_other_verified_at: null, kiosk_prompt_other_verified_by: null } });
    }
    if (req.body.verifyField) {
      const field = req.body.verifyField;
      if (!['kiosk_prompt', 'kiosk_prompt_other'].includes(field) || !String(req.body.expectedQuestion || '').trim() || req.body.expectedQuestion !== objective[field]) return res.status(409).json({ error: { message: 'The question changed. Reload and review it before verifying.' } });
      const [result] = await clinicalPool.execute(`UPDATE clinical_treatment_plan_objectives SET ${field}_verified_at = NOW(), ${field}_verified_by = ? WHERE id = ? AND ${field} = ?`, [req.user.id, objectiveId, req.body.expectedQuestion]);
      if (!result.affectedRows) return res.status(409).json({ error: { message: 'The question changed. Review it again.' } });
      return res.json({ ok: true, verifiedAt: new Date().toISOString(), verifiedBy: req.user.id });
    }
    if (req.body.interventions !== undefined) {
      if (!Array.isArray(req.body.interventions) || req.body.interventions.some((item) => typeof item !== 'string' || item.length > 160)) return res.status(400).json({ error: { message: 'Use an array of intervention names, each up to 160 characters.' } });
      await clinicalPool.execute('UPDATE clinical_treatment_plan_objectives SET interventions_json = ? WHERE id = ?', [JSON.stringify([...new Set(req.body.interventions.map((v) => v.trim()).filter(Boolean))]), objectiveId]);
    }
    await ClinicalTreatmentPlan.updateObjectiveKioskPrompts(objectiveId, {
      kioskPrompt: req.body.kioskPrompt !== undefined ? req.body.kioskPrompt : undefined,
      kioskPromptOther: req.body.kioskPromptOther !== undefined ? req.body.kioskPromptOther : undefined
    });
    const guardianSharing = req.body.interventions !== undefined
      ? await shareSavedPlanToGuardians(await ClinicalTreatmentPlan.findById(objective.treatment_plan_id), req.user.id)
      : null;
    return res.json({ ok: true, guardianSharing });
  } catch (e) {
    next(e);
  }
};

export const amendTreatmentPlan = async (req, res, next) => {
  try {
    const planId = parseIntValue(req.params.planId);
    const agencyId = parseIntValue(req.body.agencyId);
    const clientId = parseIntValue(req.body.clientId);
    if (!planId || !agencyId || !clientId) {
      return res.status(400).json({ error: { message: 'planId, agencyId, and clientId are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const goals = Array.isArray(req.body.goals) ? req.body.goals : [];
    const plan = await ClinicalTreatmentPlan.amend({
      planId,
      agencyId,
      clientId,
      goals: goals.map((g, i) => ({
        goalId: parseIntValue(g.goalId),
        goalIndex: g.goalIndex || i + 1,
        goalText: g.goalText != null ? String(g.goalText) : undefined,
        projectedCompletion: g.projectedCompletion,
        objectives: (g.objectives || []).map((o, j) => ({
          objectiveId: parseIntValue(o.objectiveId),
          objectiveIndex: o.objectiveIndex || j + 1,
          objectiveText: o.objectiveText != null ? String(o.objectiveText) : undefined,
          scaleCurrent: o.scaleCurrent,
          scaleTarget: o.scaleTarget,
          measurementMethod: o.measurementMethod
        }))
      }))
    });

    // Keep amended plans linked to primary diagnosis when present on chart.
    try {
      let primaryDiagnosisId = parseIntValue(req.body.primaryDiagnosisId);
      let diagnosticJustification = req.body.diagnosticJustification
        ? String(req.body.diagnosticJustification).trim()
        : null;
      if (!primaryDiagnosisId) {
        const primary = await getPrimaryClinicalDiagnosis({ agencyId, clientId });
        if (primary) {
          primaryDiagnosisId = primary.id;
          if (!diagnosticJustification && primary.justification) {
            diagnosticJustification = String(primary.justification);
          }
        }
      }
      if (plan?.id && primaryDiagnosisId) {
        await attachDiagnosisToTreatmentPlan({
          planId: plan.id,
          primaryDiagnosisId,
          diagnosticJustification
        });
      }
    } catch (e) {
      console.warn('[amendTreatmentPlan] diagnosis attach skipped:', e?.message);
    }

    const refreshedPlan = await ClinicalTreatmentPlan.findById(plan.id);
    const guardianSharing = await shareSavedPlanToGuardians(refreshedPlan, req.user.id);
    return res.json({ plan: refreshedPlan, guardianSharing });
  } catch (e) {
    if (String(e.message || '').includes('requires at least one new objective')) {
      return res.status(400).json({ error: { message: e.message } });
    }
    next(e);
  }
};

export const updateEncounter = async (req, res, next) => {
  try {
    const sessionId = parseIntValue(req.params.sessionId);
    const session = await ClinicalSession.findById(sessionId);
    if (!session) return res.status(404).json({ error: { message: 'Clinical session not found' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId: session.agency_id });

    const fields = [];
    const vals = [];
    const map = {
      encounterStatus: 'encounter_status',
      placeOfService: 'place_of_service',
      durationMinutes: 'duration_minutes',
      isTelehealth: 'is_telehealth',
      renderingProviderUserId: 'rendering_provider_user_id'
    };
    for (const [bodyKey, col] of Object.entries(map)) {
      if (req.body?.[bodyKey] === undefined) continue;
      fields.push(`${col} = ?`);
      if (bodyKey === 'isTelehealth') vals.push(req.body[bodyKey] ? 1 : 0);
      else if (bodyKey === 'durationMinutes' || bodyKey === 'renderingProviderUserId') {
        vals.push(parseIntValue(req.body[bodyKey]));
      } else vals.push(String(req.body[bodyKey]));
    }
    if (!fields.length) return res.status(400).json({ error: { message: 'No encounter fields to update' } });
    if (Object.keys(map).some(key => key !== 'encounterStatus' && req.body?.[key] !== undefined)) {
      const [[signed]] = await clinicalPool.execute('SELECT id FROM clinical_notes WHERE clinical_session_id=? AND agency_id=? AND is_deleted=0 AND provider_signed_at IS NOT NULL LIMIT 1',[sessionId,session.agency_id]);
      if (signed) return res.status(409).json({error:{message:'Correct signed encounter details through an attributed service-detail amendment and supervisor approval.'}});
    }
    vals.push(sessionId);
    await clinicalPool.execute(
      `UPDATE clinical_sessions SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      vals
    );
    const updated = await ClinicalSession.findById(sessionId);
    return res.json({ session: updated });
  } catch (e) {
    next(e);
  }
};

export const getClinicalNoteById = async (req, res, next) => {
  try {
    const noteId = parseIntValue(req.params.noteId);
    if (!noteId) {
      return res.status(400).json({ error: { message: 'noteId is required' } });
    }

    let note = await ClinicalNote.findById(noteId);
    if (!note || note.is_deleted) {
      return res.status(404).json({ error: { message: 'Note not found' } });
    }
    const requestedAgencyId = Number(req.query?.agencyId || req.medicalBillingAgencyId || note.agency_id);
    if (requestedAgencyId !== Number(note.agency_id)) return res.status(404).json({ error: { message: 'Note not found in this agency.' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId: note.agency_id });

    const [[originalSession]] = note.clinical_session_id ? await clinicalPool.execute(
      'SELECT * FROM clinical_sessions WHERE id=? AND agency_id=? AND client_id=?',
      [note.clinical_session_id,note.agency_id,note.client_id]).catch(()=>{throw Object.assign(new Error('Unable to load the linked encounter details. Please try again.'),{status:503});}) : [[{}]];
    if (note.clinical_session_id && !originalSession) throw Object.assign(new Error('The linked encounter is unavailable.'),{status:409});
    const approvedContext = await getApprovedClinicalContext({note,session:originalSession || {}});
    note = approvedContext.note;
    const versions = note.provider_signed_at ? await getRevisionSummary({noteId:note.id,agencyId:note.agency_id}) : null;
    const signingToken = note.provider_signed_at ? null : clinicalNoteSnapshotHash(note,originalSession || {});

    let plain = maybeDecryptNotePayload(note.note_payload);
    let outputJson = null;
    if (plain) {
      try {
        outputJson = typeof plain === 'string' ? JSON.parse(plain) : plain;
      } catch {
        outputJson = { sections: { Narrative: String(plain) }, meta: {} };
      }
    }

    let metadata = {};
    try {
      metadata =
        typeof note.metadata_json === 'string'
          ? JSON.parse(note.metadata_json || '{}')
          : note.metadata_json || {};
    } catch {
      metadata = {};
    }

    let officeEventId = metadata?.officeEventId || null;
    let clinicalSessionId = note.clinical_session_id || null;
    if (clinicalSessionId && !officeEventId) {
      try {
        const [sess] = await clinicalPool.execute(
          `SELECT office_event_id FROM clinical_sessions WHERE id = ? LIMIT 1`,
          [clinicalSessionId]
        );
        officeEventId = sess?.[0]?.office_event_id || null;
      } catch {
        // ignore
      }
    }

    const standalone = !clinicalSessionId && !officeEventId;
    const pendingCosign = await mapPendingSupervisorCosign([note]);
    const needsSupervisorCosign = versions?.effectiveRevision?.approval && !versions?.pendingRevisionId ? false : !!pendingCosign.get(Number(note.id));
    const structuredChart = metadata?.structuredChart || null;

    let primaryDiagnosis = null;
    const dxId = note.primary_diagnosis_id || metadata?.primaryDiagnosisId || null;
    if (dxId) {
      try {
        const [dxRows] = await clinicalPool.execute(
          `SELECT id, icd10_code, description, is_primary, justification
           FROM clinical_diagnoses
           WHERE id = ?
           LIMIT 1`,
          [Number(dxId)]
        );
        primaryDiagnosis = dxRows?.[0] || null;
      } catch {
        primaryDiagnosis = null;
      }
    }
    if (!primaryDiagnosis && note.client_id) {
      try {
        primaryDiagnosis = await getPrimaryClinicalDiagnosis({
          agencyId: note.agency_id,
          clientId: note.client_id
        });
      } catch {
        primaryDiagnosis = null;
      }
    }

    let objectiveRatings = [];
    if (note.client_id) {
      try {
        objectiveRatings = await ClinicalTreatmentObjectiveRating.listForClinicalNote({
          agencyId: note.agency_id,
          clientId: note.client_id,
          clinicalNoteId: note.id,
          draftId: metadata?.draftId || null,
          dateOfService: metadata?.dateOfService || null
        });
      } catch {
        objectiveRatings = [];
      }
    }

    const diagnosticJustification =
      note.diagnostic_justification
      || structuredChart?.diagnosticJustification
      || primaryDiagnosis?.justification
      || null;

    let providerSigner = null;
    const signerId = note.provider_signed_by_user_id || note.created_by_user_id || metadata?.signedByUserId || metadata?.providerUserId || null;
    if (signerId) {
      try {
        const pool = (await import('../config/database.js')).default;
        const [userRows] = await pool.execute(
          `SELECT id, first_name, last_name, credential, email
           FROM users WHERE id = ? LIMIT 1`,
          [Number(signerId)]
        );
        const u = userRows?.[0];
        if (u) {
          providerSigner = {
            id: u.id,
            name: [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || null,
            credentials: u.credential || null,
            npi: await providerBillingNpi({agencyId:note.agency_id,userId:u.id}),
            email: u.email || null
          };
        }
      } catch {
        providerSigner = null;
      }
    }

    let sessionTiming = null;
    let serviceDetailSession = {};
    if (clinicalSessionId) {
      try {
        const s = approvedContext.session;
        if (!s) throw new Error('Linked encounter unavailable');
        serviceDetailSession = s;
        if (s) {
          sessionTiming = {
            appointmentId: s.appointment_id || null,
            sourceTimezone: s.source_timezone || 'UTC',
            serviceLocationId: s.service_location_id || null,
            placeOfService: s.place_of_service || null,
            timeZone: s.source_timezone || null,
            startAt: s.scheduled_start_at || null,
            endAt: s.scheduled_end_at || null,
            durationMinutes: s.duration_minutes ?? null,
            serviceCode: s.service_code || null,
            locationLabel: sessionLocationLabel(s),
            providerUserId: s.provider_user_id || null
          };
          if (!providerSigner && s.provider_user_id) {
            try {
              const pool = (await import('../config/database.js')).default;
              const [userRows] = await pool.execute(
                `SELECT id, first_name, last_name, credential, email
                 FROM users WHERE id = ? LIMIT 1`,
                [Number(s.provider_user_id)]
              );
              const u = userRows?.[0];
              if (u) {
                providerSigner = {
                  id: u.id,
                  name: [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || null,
                  credentials: u.credential || null,
                  npi: await providerBillingNpi({agencyId:note.agency_id,userId:u.id}),
                  email: u.email || null
                };
              }
            } catch {
              // ignore
            }
          }
        }
      } catch {
        throw Object.assign(new Error('Unable to load the linked encounter details. Please try again.'), { status: 503 });
      }
    }

    const billingAccess = await hasSchedulingBillingAccess(req.user, note.agency_id);
    let linkedClaim = null;
    try {
      const [claimRows] = billingAccess ? await clinicalPool.execute(`SELECT id, claim_lifecycle AS claim_status, billing_npi, rendering_npi
        FROM clinical_claims WHERE clinical_note_id = ? AND agency_id = ? AND is_deleted = 0 ORDER BY id DESC LIMIT 1`,
        [note.id, note.agency_id]) : [[]];
      const claimRow = claimRows[0] || null;
      if (claimRow) {
        const raw = String(
          claimRow.claim_status || claimRow.claim_md_status || claimRow.billing_status || claimRow.status || ''
        ).toLowerCase();
        let statusKey = 'waiting';
        if (/submit|sent|transmit/.test(raw)) statusKey = 'submitted';
        else if (/reject|deny|denied/.test(raw)) statusKey = 'rejected';
        else if (/paid/.test(raw)) statusKey = 'complete';
        else if (/pend|wait|draft|ready|queue/.test(raw)) statusKey = 'waiting';
        linkedClaim = {
          id: claimRow.id,
          statusKey,
          statusLabel:
            statusKey === 'submitted' ? 'Submitted'
              : statusKey === 'rejected' ? 'Rejected'
                : statusKey === 'complete' ? 'Complete'
                  : 'Waiting',
          billingNpi: claimRow.billing_npi || null,
          renderingNpi: claimRow.rendering_npi || null
        };
      }
    } catch {
      linkedClaim = null;
    }

    let clientPayer = null;
    if (billingAccess && note.client_id) {
      const insurance = await readClientInsurance(note.client_id, note.agency_id);
      if (insurance) clientPayer = { name: insurance.primary?.insurerName || null, memberId: insurance.primary?.memberId || null };
    }

    await logNoteAidChartEvent(req, { clientId: note.client_id, agencyId: note.agency_id, action: 'clinical_note_viewed', metadata: { noteId: note.id, clinicalSessionId: note.clinical_session_id || null } });
    const serviceDetailView = effectiveServiceDetails(note,serviceDetailSession);
    let serviceDetailProposal = null;
    if (metadata.source === H0002_SOURCE && metadata.screeningTaskId && !metadata.structuredChart?.participants) {
      try {
        const source = await loadScreeningSource(metadata.screeningTaskId);
        if (Number(source.client.id)===Number(note.client_id) && Number(source.task.assigned_to_agency_id)===Number(note.agency_id)) serviceDetailProposal=screeningEncounterProposal(source);
      } catch { /* Missing source evidence leaves manual confirmation available. */ }
    }
    let canSuperviseReview = false;
    try { canSuperviseReview = Number((await resolveNoteDocumentationPolicy(note)).supervisorUserId) === Number(req.user.id) && Number(note.provider_signed_by_user_id || note.created_by_user_id) !== Number(req.user.id); } catch { /* Authorization fails closed. */ }
    const clinicalSigner = CLINICAL_SIGNER_ROLES.has(String(req.user.role || req.user.effectiveRole || '').toLowerCase());
    let clientName = metadata.clientName || null;
    if (note.client_id) {
      const [[client]] = await pool.execute('SELECT full_name,initials FROM clients WHERE id=?',[note.client_id]);
      clientName = client?.full_name || client?.initials || clientName;
    }

    return res.json(await schedulingResponseForUser(req.user, note.agency_id, {
      note: {
        id: note.id,
        agencyId: note.agency_id,
        clientId: note.client_id,
        clientName,
        canSuperviseReview,
        canSignClinicalNote: clinicalSigner && !note.provider_signed_at && Number(note.created_by_user_id)===Number(req.user.id),
        canSignAddendum: clinicalSigner && !!note.provider_signed_at && (canSuperviseReview || Number(note.provider_signed_by_user_id || note.created_by_user_id)===Number(req.user.id)),
        signingToken,
        clinicalVersion: approvedContext.version,
        contentHash: note.clinical_version_content_hash || note.content_hash || null,
        versions,
        reviewSnapshotToken: reviewSnapshotToken(note,serviceDetailSession),
        isBillable: !isNonBillableDocument(note),
        reviewRequests: reviewRequestsForDisplay(metadata),
        serviceDetailAmendments: metadata.serviceDetailAmendments || [],
        serviceTimeZone: sessionTiming?.timeZone || 'America/Denver',
        effectiveServiceDetails: serviceDetailView,
        serviceDetailProposal,
        pendingServiceDetails: pendingServiceDetails(metadata),
        title: note.title,
        noteType: note.note_type || metadata?.noteType || null,
        serviceCode: metadata?.serviceCode || sessionTiming?.serviceCode || null,
        billingPrimaryUnits: metadata?.billingPrimaryUnits || 1,
        billingAddons: metadata?.billingAddons || [],
        clinicalSessionId,
        officeEventId,
        standalone,
        providerSignedAt: note.provider_signed_at || null,
        providerReview: note.content_review_source === 'provider_review' ? (typeof note.content_review_json === 'string' ? JSON.parse(note.content_review_json) : note.content_review_json) : null,
        providerSignedByUserId: note.provider_signed_by_user_id || null,
        supervisorCosignedAt: note.supervisor_cosigned_at || null,
        supervisorCosignedByUserId: note.supervisor_cosigned_by_user_id || null,
        needsSupervisorCosign,
        attestation: versions ? versions.revisions?.find(version=>Number(version.id)===Number(versions.originalRevisionId))?.snapshot?.metadataJson?.attestation || null : metadata?.attestation || null,
        supervisorCosign: metadata?.supervisorCosign || null,
        supervisorCosignHistory: metadata?.supervisorCosignHistory || [],
        dateOfService: metadata?.dateOfService || null,
        createdAt: note.created_at,
        updatedAt: note.updated_at,
        outputJson,
        metadata,
        structuredChart,
        sessionTiming,
        providerSigner,
        linkedClaim,
        clientPayer,
        locationLabel: serviceDetailView.locationLabel,
        startTime: serviceDetailView.startTime,
        endTime: serviceDetailView.endTime,
        durationMinutes: serviceDetailView.durationMinutes,
        primaryDiagnosis: primaryDiagnosis
          ? {
              id: primaryDiagnosis.id,
              icd10Code: primaryDiagnosis.icd10_code || null,
              description: primaryDiagnosis.description || null,
              isPrimary: !!primaryDiagnosis.is_primary
            }
          : null,
        diagnosticJustification,
        objectiveRatings: (objectiveRatings || []).map((r) => ({
          id: r.id,
          objectiveId: r.objective_id,
          goalId: r.goal_id,
          objectiveText: r.objective_text || null,
          goalText: r.goal_text || null,
          goalIndex: r.goal_index,
          objectiveIndex: r.objective_index,
          scaleStart: r.scale_start ?? null,
          scalePrevious: r.scale_previous ?? null,
          scaleValue: r.scale_value,
          scaleTarget: r.scale_target_at_rating ?? r.scale_target,
          disposition: r.disposition,
          progressLabel: r.progress_label,
          raterKind: r.rater_kind || 'clinician',
          raterLabel: r.rater_label || null,
          dateOfService: r.date_of_service,
          ratedAt: r.rated_at
        })),
        addenda: (await listNoteAddenda(note.id)).map((a) => ({
          id: a.id,
          body: a.body,
          entryKind: a.entry_kind,
          reason: a.entry_reason,
          authorSignedAt: a.author_signed_at,
          createdByUserId: a.created_by_user_id,
          createdAt: a.created_at
        })),
        billingAmendments: []
      }
    }));
  } catch (e) {
    next(e);
  }
};

export const downloadTreatmentSummaryPdf = async (req, res, next) => {
  try {
    const noteId = parseIntValue(req.params.noteId);
    if (!noteId) return res.status(400).json({ error: { message: 'noteId is required' } });
    let note = await ClinicalNote.findById(noteId);
    if (!note || note.is_deleted) return res.status(404).json({ error: { message: 'Note not found' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId: note.agency_id });
    const requestedAgencyId = req.query?.agencyId;
    if (requestedAgencyId && Number(requestedAgencyId) !== Number(note.agency_id)) return res.status(404).json({ error: { message: 'Note not found in this agency.' } });
    const [[session]] = note.clinical_session_id ? await clinicalPool.execute('SELECT * FROM clinical_sessions WHERE id=? AND agency_id=? AND client_id=?', [note.clinical_session_id, note.agency_id, note.client_id]) : [[{}]];
    if (note.clinical_session_id && !session) throw Object.assign(new Error('The linked clinical encounter is unavailable.'), { status: 409 });
    note = (await getApprovedClinicalContext({ note, session: session || {} })).note;

    let meta = {};
    try {
      meta = typeof note.metadata_json === 'string'
        ? JSON.parse(note.metadata_json || '{}')
        : (note.metadata_json || {});
    } catch {
      meta = {};
    }
    const noteType = String(note.note_type || meta.noteType || '').toUpperCase();
    const toolId = String(meta.toolId || '').toLowerCase();
    if (!noteType.includes('SUMMARY') && !toolId.includes('treatment_summary')) {
      return res.status(400).json({
        error: { message: 'This note is not a treatment summary document' }
      });
    }

    const {
      generateTreatmentSummaryPdf,
      extractNotePayloadText
    } = await import('../services/treatmentSummaryPdf.service.js');

    let providerName = '';
    let supervisorName = '';
    try {
      const User = (await import('../models/User.model.js')).default;
      if (note.provider_signed_by_user_id) {
        const u = await User.findById(note.provider_signed_by_user_id);
        providerName = [u?.first_name, u?.last_name].filter(Boolean).join(' ');
      } else if (note.created_by_user_id) {
        const u = await User.findById(note.created_by_user_id);
        providerName = [u?.first_name, u?.last_name].filter(Boolean).join(' ');
      }
      if (note.supervisor_cosigned_by_user_id) {
        const u = await User.findById(note.supervisor_cosigned_by_user_id);
        supervisorName = [u?.first_name, u?.last_name].filter(Boolean).join(' ');
      }
    } catch {
      // names optional
    }

    const entriesText = formatNoteEntriesForExport(note.clinical_version_addenda || await listNoteAddenda(note.id));
    const revised = Number(note.clinical_version_number) > 1;
    const authorSignature = note.clinical_version_signatures?.find(signature => ['author_sign', 'initial_author_sign'].includes(signature.action));
    const authorAcknowledgement = note.clinical_version_signatures?.find(signature => signature.action === 'author_acknowledge');
    const versionDetails = note.clinical_version_id ? `Clinical version ${note.clinical_version_number}${revised && !authorSignature ? '\nThe responsible supervisor signed this amendment.' : ''}${authorAcknowledgement ? `\nOriginal author reviewed and acknowledged this version: ${authorAcknowledgement.signedAt}` : ''}` : '';
    const pdf = await generateTreatmentSummaryPdf({
      agencyId: note.agency_id,
      bodyText: [versionDetails, extractNotePayloadText(note), entriesText].filter(Boolean).join('\n\n'),
      title: note.title || 'Treatment Summary',
      clientInitials: meta?.structuredChart?.clientInitials || meta?.initials || '',
      dateOfService: meta?.dateOfService || null,
      providerName,
      supervisorName,
      providerSignedAt: revised ? authorSignature?.signedAt || null : note.provider_signed_at || null,
      supervisorSignedAt: note.supervisor_cosigned_at || null
    });

    const filename = `treatment-summary-${noteId}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(Buffer.from(pdf));
  } catch (e) {
    next(e);
  }
};

export const attachTreatmentSummaryPrintUpload = async (req, res, next) => {
  try {
    const noteId = parseIntValue(req.params.noteId);
    const agencyId = parseIntValue(req.body?.agencyId);
    const phiDocumentId = parseIntValue(req.body?.phiDocumentId);
    if (!noteId || !agencyId || !phiDocumentId) {
      return res.status(400).json({ error: { message: 'noteId, agencyId, and phiDocumentId are required' } });
    }
    const note = await ClinicalNote.findById(noteId);
    if (!note || note.is_deleted) return res.status(404).json({ error: { message: 'Note not found' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId: note.agency_id });
    if (Number(note.agency_id) !== agencyId) {
      return res.status(400).json({ error: { message: 'agencyId mismatch' } });
    }

    let meta = {};
    try {
      meta = typeof note.metadata_json === 'string'
        ? JSON.parse(note.metadata_json || '{}')
        : (note.metadata_json || {});
    } catch {
      meta = {};
    }
    meta.printUpload = {
      phiDocumentId,
      signedByName: req.body?.signedByName ? String(req.body.signedByName).slice(0, 255) : null,
      attachedAt: new Date().toISOString(),
      attachedByUserId: req.user.id
    };
    meta.digitalShare = {
      ...(meta.digitalShare || {}),
      printUploadPhiDocumentId: phiDocumentId
    };
    await ClinicalNote.updatePayload({
      noteId: note.id,
      metadataJson: meta
    });

    return res.json({
      ok: true,
      noteId: note.id,
      phiDocumentId,
      message: 'Signed treatment summary print upload linked to this document.'
    });
  } catch (e) {
    next(e);
  }
};

const clinicalSignatureHandoff = Symbol('authorized-clinical-signature-handoff');
export async function draftClaimAfterSignature(req, note) {
  // Derive lines from the saved clinical record, not a second browser request.
  // Failed drafts remain visible in the billing desk's missing-claim queue.
  if (!note.clinical_session_id) return;
  // This symbol can only be supplied by the already-authorized signature paths;
  // a public request body cannot impersonate the final clinical signer.
  let code = 200;
  const response = { status(value) { code = value; return this; }, json() { return this; } };
  try {
    await createMedicalClaim({ ...req, [clinicalSignatureHandoff]: true, body: { agencyId: note.agency_id, clientId: note.client_id,
      clinicalSessionId: note.clinical_session_id, clinicalNoteId: note.id } }, response, error => { throw error; });
    if (code >= 400) console.warn('[claim-draft] Signed note awaits billing preparation', { noteId: note.id, status: code });
  } catch {
    console.warn('[claim-draft] Signed note awaits billing preparation', { noteId: note.id });
  }
}

export const reviewClinicalNote = async (req,res,next) => {
  try {
    const agencyId=parseIntValue(req.body?.agencyId);
    await ClinicalEligibilityService.ensureAgencyAccess({reqUser:req.user,agencyId});
    const {completeNonbillableReview}=await import('../services/nonbillableNoteCompletion.service.js');
    return res.json(await completeNonbillableReview({noteId:parseIntValue(req.params.noteId),agencyId,actorUserId:req.user.id,confirmed:req.body.contentReviewConfirmed,expectedHash:req.body.contentHash}));
  }catch(error){next(error);}
};

async function reviewSubmittedNote(req,note){
 try{await (await import('../services/narrivaSubmissionReview.service.js')).reviewNarrivaSubmission(req,note);}
 catch{console.warn('[signClinicalNote] Submission review unavailable; signed note preserved.');}
}
export const signClinicalNote = async (req, res, next) => {
  let signingDb=null;
  try {
    assertClinicalSigner(req.user);
    const noteId = parseIntValue(req.params.noteId);
    signingDb=await clinicalPool.getConnection();
    await signingDb.beginTransaction();
    const [[reference]]=await signingDb.execute('SELECT clinical_session_id,agency_id FROM clinical_notes WHERE id=?',[noteId]);
    if (!reference) throw Object.assign(new Error('Note not found.'),{status:404});
    const [[lockedSession]]=reference.clinical_session_id ? await signingDb.execute('SELECT * FROM clinical_sessions WHERE id=? AND agency_id=? FOR UPDATE',[reference.clinical_session_id,reference.agency_id]) : [[{}]];
    const [rows]=await signingDb.execute('SELECT * FROM clinical_notes WHERE id=? AND agency_id=? FOR UPDATE',[noteId,reference.agency_id]);
    const note = rows?.[0];
    if (!note || note.is_deleted) throw Object.assign(new Error('Note not found.'),{status:404});
    if (Number(note.clinical_session_id || 0)!==Number(reference.clinical_session_id || 0)) throw Object.assign(new Error('The encounter link changed. Reload before signing.'),{status:409});
    if (note.clinical_session_id && !lockedSession) throw Object.assign(new Error('The linked encounter is unavailable.'),{status:409});
    assertNoPendingClinicalServiceChange(lockedSession);
    if (Number(req.body?.agencyId || req.medicalBillingAgencyId || note.agency_id)!==Number(note.agency_id)) throw Object.assign(new Error('Note not found in this agency.'),{status:404});
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId: note.agency_id });

    if (Number(note.created_by_user_id) !== Number(req.user.id)) {
      throw Object.assign(new Error('Only the note author can apply the provider signature'),{status:403});
    }
    if (note.provider_signed_at) {
      await signingDb.commit();signingDb.release();signingDb=null;
      try { const {onSignedNoteCopay}=await import('../services/familyLedger/copayAttendance.js'); await onSignedNoteCopay({agencyId:note.agency_id,noteId:note.id,providerUserId:req.user.id}); } catch { console.warn('[signClinicalNote] Copay attendance needs billing review'); }
      await completeH0002Screening(note, new Date(note.provider_signed_at).toISOString());
      const retryMeta = typeof note.metadata_json === 'string' ? JSON.parse(note.metadata_json) : note.metadata_json;
      if (retryMeta?.source === H0002_SOURCE) await draftClaimAfterSignature(req, note);
      const terminationTodo = await completeNoteAidSigningWorkflow(note);
      await reviewSubmittedNote(req,note);
      return res.json({ ok: true, noteId, signedAt: note.provider_signed_at, terminationTodo });
    }
    if (!req.body?.signingToken || req.body.signingToken!==clinicalNoteSnapshotHash(note,lockedSession || {})) throw Object.assign(new Error('This draft or its service context changed. Reload and review the current version before signing.'),{status:409});
    const accurate = req.body?.accurateAndComplete === true || req.body?.accurateAndComplete === 'true';
    const necessary =
      req.body?.medicalNecessityAttested === true || req.body?.medicalNecessityAttested === 'true';
    const terminationNote = String(note.note_type).toUpperCase() === 'TERMINATION';
    const contentReviewOnly=isNonBillableDocument(note);
    const contentReviewed = req.body?.contentReviewConfirmed === true;
    if (!accurate || (contentReviewOnly ? !contentReviewed : !necessary)) {
      throw Object.assign(new Error(contentReviewOnly ? 'Accuracy and content review attestations are required to sign this non-billable document.' : 'Accuracy and medical necessity attestations are required to sign.'),{status:400});
    }

    if (note.clinical_session_id) {
      const screenSession=lockedSession;
      if (Number(screenSession.client_id)!==Number(note.client_id)) throw Object.assign(new Error('The encounter client changed.'),{status:409});
      const screenMeta = typeof screenSession?.metadata_json === 'string' ? JSON.parse(screenSession.metadata_json) : screenSession?.metadata_json;
      const noteMeta = typeof note.metadata_json === 'string' ? JSON.parse(note.metadata_json) : note.metadata_json;
      if (noteMeta?.serviceCode === 'H0002') assertServiceDetailsComplete(note,screenSession || {});
      if (screenMeta?.source === H0002_SOURCE && noteMeta?.source !== H0002_SOURCE) throw Object.assign(new Error('Use the digital screening review to sign this encounter.'),{status:409});
    }
    validateScreeningSignature(note);
    await assertNarrivaRiskBeforeSignature(note);
    const plain = maybeDecryptNotePayload(note.note_payload);
    const hash = contentHash(plain);
    let meta = {};
    try {
      meta =
        typeof note.metadata_json === 'string'
          ? JSON.parse(note.metadata_json || '{}')
          : note.metadata_json || {};
    } catch {
      meta = {};
    }

    if (terminationNote && meta.termination) {
      validateTermination(meta.termination);
      validateTerminationContent(plain);
    }
    if (meta.interactiveComplexityPending) return res.status(400).json({ error: { message: 'Complete the interactive complexity justification before signing.' } });
    if (meta.treatmentRecommendation === 'terminate' && !terminationNote && !['now', 'after_progress', 'later'].includes(meta.terminationNextStep)) {
      return res.status(400).json({ error: { message: 'Choose when to write the termination note before signing.' } });
    }

    if (isProgressClinicalNote(note, meta)) {
      const plans = await ClinicalTreatmentPlan.listByClient({
        agencyId: note.agency_id,
        clientId: note.client_id
      }).catch(() => []);
      const active = (plans || []).find((p) => {
        const st = String(p.status || '').toLowerCase();
        return st === 'active' || st === 'final';
      });
      if (!active) {
        return res.status(400).json({
          error: {
            message: 'A treatment plan must be on file before a progress note can be signed.',
            code: 'treatment_plan_required'
          }
        });
      }
      const maxAge = await loadTreatmentPlanMaxAgeDays(note.agency_id);
      const age = treatmentPlanAgeDays(active);
      const policy = await loadRenewalPolicy(note.agency_id);
      if (renewalStatus(active, policy).required) {
        return res.status(400).json({
          error: {
            message: `The treatment plan on file is ${age} days old (limit ${maxAge}). Update the plan before signing this progress note.`,
            code: 'treatment_plan_expired'
          }
        });
      }
      if (!note.primary_diagnosis_id && !meta.primaryDiagnosisId) {
        meta.flags = { ...(meta.flags || {}), missingDiagnosis: true };
      }
    }

    let signerLabel = null;
    try {
      const pool = (await import('../config/database.js')).default;
      const [userRows] = await pool.execute(
        `SELECT id, first_name, last_name, credential
         FROM users WHERE id = ? LIMIT 1`,
        [Number(req.user.id)]
      );
      const u = userRows?.[0];
      if (u) {
        const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
        const creds = String(u.credential || '').trim();
        let licenseLine = '';
        try {
          const [infoRows] = await pool.execute(
            `SELECT uifd.field_key, uiv.value
             FROM user_info_values uiv
             JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
             WHERE uiv.user_id = ?
               AND uifd.field_key IN (
                 'provider_credential_license_type_number',
                 'license_type_number',
                 'license_type_and_number',
                 'license_number'
               )
             ORDER BY uiv.id DESC
             LIMIT 4`,
            [Number(req.user.id)]
          );
          const hit = (infoRows || []).find((r) => String(r.value || '').trim());
          if (hit?.value) licenseLine = String(hit.value).trim();
        } catch {
          // optional profile field
        }
        const parts = [name];
        const signingNpi = await providerBillingNpi({ agencyId: note.agency_id, userId: req.user.id });
        if (signingNpi) parts.push(`NPI ${signingNpi}`);
        if (creds) parts.push(creds);
        if (licenseLine) {
          const looksLabeled = /license/i.test(licenseLine);
          parts.push(looksLabeled ? licenseLine : `License ${licenseLine}`);
        }
        signerLabel = parts.filter(Boolean).join(', ');
      }
    } catch {
      signerLabel = null;
    }

    const signedAtIso = new Date().toISOString();
    const attestationStatement = contentReviewOnly
      ? `${signerLabel || 'Provider'} signed this clinical document and confirmed that the reviewed content is accurate and complete on ${formatAttestationClock(signedAtIso)}.`
      : signerLabel
      ? `${signerLabel}, signed this note and declared this information to be accurate and complete and marked the note as medically necessary on ${formatAttestationClock(signedAtIso)}.`
      : `Provider signed this note and declared this information to be accurate and complete and marked the note as medically necessary on ${formatAttestationClock(signedAtIso)}.`;

    meta.attestation = {
      ...(meta.attestation || {}),
      accurateAndComplete: true,
      medicallyNecessary: !contentReviewOnly,
      contentReviewConfirmed: contentReviewOnly ? true : meta.attestation?.contentReviewConfirmed,
      attestedAt: signedAtIso,
      attestedByUserId: req.user.id,
      signerLabel,
      statement: attestationStatement,
      ipAddress: getClientIpAddress(req),
      userAgent: String(req.headers['user-agent'] || '').slice(0, 500) || null
    };
    const documentationPolicy = await resolveNoteDocumentationPolicy(note,pool,signingDb);
    const nonBillable = isNonBillableDocument(note);
    if (!nonBillable) await assertClientDiagnosisPolicy({ agencyId: note.agency_id, clientId: note.client_id, providerUserId: note.provider_signed_by_user_id || note.created_by_user_id || lockedSession?.provider_user_id, serviceCode: lockedSession?.service_code || meta.serviceCode, dateOfService: meta.dateOfService || parseObject(lockedSession?.metadata_json).serviceDate, note });
    const mandatoryTypes = nonBillable ? await requiredDocumentReviewTypes(note.agency_id, note.client_id, note.created_at) : [];
    const wantsReview = hasClinicalAmendments(note) || !nonBillable || mandatoryTypes.includes(normalizeNoteType(note.note_type || meta.noteType)) || documentationPolicy.nonBillableReview === 'all'
      || (documentationPolicy.nonBillableReview === 'selected' && documentationPolicy.noteTypes.includes(normalizeNoteType(note.note_type || meta.noteType)));
    const supervisor = wantsReview && documentationPolicy.supervisorUserId ? { supervisor_id: documentationPolicy.supervisorUserId } : null;
    // Billability describes the service. Submission timing is evaluated separately for each payer.
    const isBillable = !nonBillable;
    meta.supervisionPolicyAtSignature = { version: documentationPolicy.version, supervisorUserId: documentationPolicy.supervisorUserId, cosignTiming: documentationPolicy.cosignTiming, cosignDueDays: documentationPolicy.cosignDueDays };
    if (supervisor) markSupervisorQueue(meta,note,supervisor.supervisor_id,'awaiting_supervisor');
    const [signedUpdate]=await signingDb.execute(
      `UPDATE clinical_notes
       SET provider_signed_at = NOW(),
           is_billable = ?,
           provider_signed_by_user_id = ?,
           content_hash = ?,
           metadata_json = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND provider_signed_at IS NULL`,
      [isBillable ? 1 : 0, req.user.id, hash, JSON.stringify(meta), noteId]
    );
    if (signedUpdate.affectedRows!==1) throw Object.assign(new Error('This version has already changed or been signed. Reload before continuing.'),{status:409});
    const [[persisted]]=await signingDb.execute('SELECT * FROM clinical_notes WHERE id=? AND agency_id=?',[note.id,note.agency_id]);
    const originalRevision=await ensureOriginalRevision({db:signingDb,note:persisted,session:lockedSession || {},actorUserId:req.user.id,signatureEvent:true,responsibleSupervisorUserId:supervisor?.supervisor_id || null,requiresSupervisorCosign:!!supervisor});
    await signingDb.commit();signingDb.release();signingDb=null;
    queueCommittedClinicalSourceChange({ agencyId: note.agency_id, clientId: note.client_id, sourceKind: 'note', sourceId: noteId });
    if (note.clinical_session_id && !nonBillable) {
      try {
        const { attachSignedSessionToClaim } = await import('../services/sessionClaimWindow.service.js');
        await attachSignedSessionToClaim({ agencyId: note.agency_id, sessionId: note.clinical_session_id, noteId });
      } catch (error) {
        console.warn('[session-claim] signed note was not attached', error?.message || error);
      }
    }
    Object.assign(note,persisted);
    const queueSynchronized=!supervisor || await synchronizeSupervisorQueue(note,meta.supervisorQueue);
    try {
      const { completeSessionNoteTasksForSession } = await import(
        '../services/sessionDocumentationTask.service.js'
      );
      let officeEventId = null;
      let clinicalSessionId = note.clinical_session_id || null;
      try {
        const meta =
          typeof note.metadata_json === 'string'
            ? JSON.parse(note.metadata_json)
            : note.metadata_json || {};
        officeEventId = meta?.officeEventId || null;
      } catch {
        // ignore
      }
      if (clinicalSessionId && !officeEventId) {
        const [sess] = await clinicalPool.execute(
          `SELECT office_event_id FROM clinical_sessions WHERE id = ? LIMIT 1`,
          [clinicalSessionId]
        );
        officeEventId = sess?.[0]?.office_event_id || null;
      }
      await completeSessionNoteTasksForSession({
        officeEventId,
        clinicalSessionId,
        clientId: note.client_id
      });
    } catch (bridgeErr) {
      console.warn('[signClinicalNote] session note task complete failed', bridgeErr?.message || bridgeErr);
    }
    try {
      let meta = {};
      try {
        meta =
          typeof note.metadata_json === 'string'
            ? JSON.parse(note.metadata_json || '{}')
            : note.metadata_json || {};
      } catch {
        meta = {};
      }
      await ClinicalTreatmentObjectiveRating.linkToClinicalNote({
        agencyId: note.agency_id,
        clientId: note.client_id,
        clinicalNoteId: noteId,
        draftId: meta?.draftId || null,
        dateOfService: meta?.dateOfService || null
      });
    } catch (linkErr) {
      console.warn('[signClinicalNote] objective rating link failed', linkErr?.message || linkErr);
    }
    // Imported service tasks have no calendar completion action. A signed service
    // note attests to the encounter; never revive a canceled/no-show encounter.
    if (!nonBillable && note.clinical_session_id) {
      await clinicalPool.execute(`UPDATE clinical_sessions SET encounter_status='completed'
        WHERE id=? AND agency_id=? AND client_id=? AND encounter_status='scheduled'
          AND JSON_UNQUOTE(JSON_EXTRACT(metadata_json,'$.source'))='note_aid_todo_import'
          AND JSON_UNQUOTE(JSON_EXTRACT(metadata_json,'$.serviceDate')) <= ?`,
      [note.clinical_session_id,note.agency_id,note.client_id,new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())]);
    }
    await completeH0002Screening({ ...note, metadata_json: meta }, signedAtIso);
    const terminationTodo = await completeNoteAidSigningWorkflow({ ...note, provider_signed_at: signedAtIso, metadata_json: meta });
    if (!nonBillable) await draftClaimAfterSignature(req, note);
    try { const {onSignedNoteCopay}=await import('../services/familyLedger/copayAttendance.js'); await onSignedNoteCopay({agencyId:note.agency_id,noteId:note.id,providerUserId:req.user.id}); } catch { console.warn('[signClinicalNote] Copay attendance needs billing review'); }
    await reviewSubmittedNote(req,persisted);
    return res.json({ ok: true, noteId, contentHash: hash, signedAt: persisted.provider_signed_at, revisionId: originalRevision.id, revisionContentHash: originalRevision.content_hash, queueSynchronizationPending: !queueSynchronized, terminationTodo });
  } catch (e) {
    if (signingDb) { await signingDb.rollback(); signingDb.release(); signingDb=null; }
    next(e);
  } finally { if (signingDb) { try { await signingDb.rollback(); } finally { signingDb.release(); } } }
};

function supervisorSignatureReceipt(note){
 const evidence=parseObject(note.metadata_json).supervisorCosign || {};
 return {cosignedAt:note.supervisor_cosigned_at,cosignedByUserId:note.supervisor_cosigned_by_user_id,
  signerLabel:evidence.signerLabel || null,statement:evidence.statement || null,contentHash:evidence.contentHash || null};
}
export const cosignClinicalNote = async (req, res, next) => {
  let cosignDb;
  try {
    assertClinicalSigner(req.user);
    const noteId = parseIntValue(req.params.noteId);
    const [rows] = await clinicalPool.execute(`SELECT * FROM clinical_notes WHERE id = ? LIMIT 1`, [noteId]);
    const note = rows?.[0];
    if (!note || note.is_deleted) return res.status(404).json({ error: { message: 'Note not found' } });
    if (Number(req.body.agencyId || req.medicalBillingAgencyId) !== Number(note.agency_id)) return res.status(404).json({error:{message:'Note not found in this agency.'}});
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId: note.agency_id });
    if (!note.provider_signed_at) {
      return res.status(400).json({ error: { message: 'Provider must sign before supervisor cosign' } });
    }

    if (Number(req.user.id) === Number(note.provider_signed_by_user_id || note.created_by_user_id)) return res.status(403).json({error:{message:'The note author cannot provide their own supervisor cosignature.'}});
    const documentationPolicy = await resolveNoteDocumentationPolicy(note);
    if (!documentationPolicy.supervisorUserId || Number(documentationPolicy.supervisorUserId) !== Number(req.user.id)) {
      return res.status(403).json({ error: { message: 'Only the assigned responsible supervisor can cosign this note' } });
    }
    cosignDb = await clinicalPool.getConnection();
    await cosignDb.beginTransaction();
    if (note.clinical_session_id) {
      await cosignDb.execute('SELECT id FROM clinical_sessions WHERE id=? AND agency_id=? FOR UPDATE',[note.clinical_session_id,note.agency_id]);
      await cosignDb.execute('SELECT id FROM clinical_claims WHERE clinical_session_id=? AND agency_id=? ORDER BY id FOR UPDATE',[note.clinical_session_id,note.agency_id]);
    }
    await cosignDb.execute('SELECT id FROM clinical_notes WHERE id = ? AND agency_id = ? FOR UPDATE',[noteId,note.agency_id]);
    await cosignDb.execute('SELECT id FROM clinical_note_addenda WHERE clinical_note_id = ? AND agency_id = ? FOR UPDATE',[noteId,note.agency_id]);
    const current = await loadReviewDocument({ agencyId:note.agency_id, providerUserId:note.provider_signed_by_user_id || note.created_by_user_id }, 'note', noteId, cosignDb);
    Object.assign(note,current.row);
    const [[liveReviewSession]] = note.clinical_session_id ? await cosignDb.execute('SELECT * FROM clinical_sessions WHERE id=? AND agency_id=?',[note.clinical_session_id,note.agency_id]) : [[{}]];
    assertNoPendingClinicalServiceChange(liveReviewSession);
    const originalRevision = await ensureOriginalRevision({db:cosignDb,note,session:liveReviewSession || {}});
    const approvedContext=await getApprovedClinicalContext({note,session:liveReviewSession || {}},cosignDb);
    if (Number(approvedContext.note.clinical_version_number)>1) throw Object.assign(new Error('Use the signature actions on the amended version. The original signatures remain on file.'),{status:409});
    Object.assign(note,approvedContext.note);
    const reviewSession=approvedContext.session;
    current.hash=originalRevision.content_hash;
    if (await hasPendingRevision({noteId,agencyId:note.agency_id},cosignDb)) throw Object.assign(new Error('Sign the pending amended version from version history. The original signature remains on file.'),{status:409});
    if (Number((await resolveNoteDocumentationPolicy(note,pool,cosignDb)).supervisorUserId) !== Number(req.user.id)) throw Object.assign(new Error('The responsible supervisor changed. Refresh the note.'),{status:403});
    if (note.supervisor_cosigned_at) {
      await cosignDb.commit();
      cosignDb.release(); cosignDb = null;
      if (!isNonBillableDocument(note)) await draftClaimAfterSignature(req, note);
      return res.json({ok:true,noteId,cosignedAt:note.supervisor_cosigned_at,supervisorCosign:supervisorSignatureReceipt(note),revisionId:originalRevision.id,isBillable:!isNonBillableDocument(note)});
    }
    if (req.body.reviewSnapshotToken !== reviewSnapshotToken(note,reviewSession || {})) throw Object.assign(new Error('The review details changed. Open the current note before approval.'),{status:409});
    if (hasCurrentSupervisorCosign(note, documentationPolicy.supervisorUserId, current.hash)) {
      await cosignDb.commit();
      return res.json({ ok:true,noteId,cosignedAt:note.supervisor_cosigned_at,supervisorCosign:supervisorSignatureReceipt(note),isBillable:!isNonBillableDocument(note) });
    }
    if (current.hash !== req.body.contentHash || req.body.reviewedAndApproved !== true) throw Object.assign(new Error('Read the current note and addenda and attest approval before cosigning.'),{status:409});
    if(req.body.quickSign===true)await (await import('../services/narrivaReview.service.js')).assertNarrivaQuickSign({user:req.user,noteId,agencyId:note.agency_id,reviewId:req.body.narrivaReviewId,clinicalDb:cosignDb});
    let meta = {};
    try {
      meta =
        typeof note.metadata_json === 'string'
          ? JSON.parse(note.metadata_json || '{}')
          : note.metadata_json || {};
    } catch {
      meta = {};
    }

    if (pendingServiceDetails(meta)) throw Object.assign(new Error('Preserve the pending service corrections in an amended version, then sign that version. The original note cannot be overwritten.'),{status:409});

    const nonBillable = isNonBillableDocument(note);
    if (!nonBillable && Number(note.is_billable)!==1) throw Object.assign(new Error('This historical service note is marked non-billable. Create and sign an amended version for billing review; its original signed classification stays on file.'),{status:409});
    let signerLabel = null;
    try {
      const pool = (await import('../config/database.js')).default;
      const [userRows] = await pool.execute(
        `SELECT id, first_name, last_name, credentials, license_type, npi
         FROM users WHERE id = ? LIMIT 1`,
        [Number(req.user.id)]
      );
      const u = userRows?.[0];
      if (u) {
        const name = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
        const creds = String(u.credentials || u.license_type || '').trim();
        let licenseLine = '';
        try {
          const [infoRows] = await pool.execute(
            `SELECT uifd.field_key, uiv.value
             FROM user_info_values uiv
             JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
             WHERE uiv.user_id = ?
               AND uifd.field_key IN (
                 'provider_credential_license_type_number',
                 'license_type_number',
                 'license_type_and_number',
                 'license_number'
               )
             ORDER BY uiv.id DESC
             LIMIT 4`,
            [Number(req.user.id)]
          );
          const hit = (infoRows || []).find((r) => String(r.value || '').trim());
          if (hit?.value) licenseLine = String(hit.value).trim();
        } catch {
          // optional
        }
        const parts = [name];
        if (creds) parts.push(creds);
        if (licenseLine) {
          const looksLabeled = /license/i.test(licenseLine);
          parts.push(looksLabeled ? licenseLine : `License ${licenseLine}`);
        }
        signerLabel = parts.filter(Boolean).join(', ');
      }
    } catch {
      signerLabel = null;
    }

    assertNoUnresolvedChanges(meta);
    if (!nonBillable) {
      assertServiceDetailsComplete(note, reviewSession || {});
      await assertClientDiagnosisPolicy({ agencyId: note.agency_id, clientId: note.client_id, providerUserId: note.provider_signed_by_user_id || note.created_by_user_id || reviewSession?.provider_user_id, serviceCode: reviewSession?.service_code || meta.serviceCode, dateOfService: meta.dateOfService || parseObject(reviewSession?.metadata_json).serviceDate, note });
    }
    const cosignedAtIso = new Date().toISOString();
    const approvalPurpose = nonBillable ? 'clinical documentation' : 'clinical documentation and documented services for billing review';
    const statement = signerLabel
      ? `${signerLabel}, reviewed and signed this note and all attached amendments/addenda and approved their ${approvalPurpose} under their license on ${formatAttestationClock(cosignedAtIso)}.`
      : `Supervisor reviewed and signed this note and all attached amendments/addenda and approved their ${approvalPurpose} on ${formatAttestationClock(cosignedAtIso)}.`;

    if (meta.supervisorCosign) meta.supervisorCosignHistory = [...(meta.supervisorCosignHistory || []),meta.supervisorCosign];
    const queueMarker = markSupervisorQueue(meta,note,req.user.id,'signed');
    meta.supervisorCosign = {
      ...(meta.supervisorCosign || {}),
      contentHash: current.hash,
      reviewedAndApproved: true,
      cosignedAt: cosignedAtIso,
      cosignedByUserId: req.user.id,
      signerLabel,
      statement,
      ipAddress: getClientIpAddress(req),
      userAgent: String(req.headers['user-agent'] || '').slice(0, 500) || null
    };

    await cosignDb.execute(
      `UPDATE clinical_notes
       SET supervisor_cosigned_at = NOW(),
           supervisor_cosigned_by_user_id = ?,
           metadata_json = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND supervisor_cosigned_at IS NULL`,
      [req.user.id, JSON.stringify(meta), noteId]
    );
    const [[persistedCosign]]=await cosignDb.execute('SELECT * FROM clinical_notes WHERE id=? AND agency_id=?',[noteId,note.agency_id]);
    await appendOriginalSignature({db:cosignDb,note:persistedCosign,session:reviewSession || {},actorUserId:req.user.id,expectedContentHash:originalRevision.content_hash,expectedEntryManifestHash:req.body.expectedEntryManifestHash});
    await cosignDb.commit();
    cosignDb.release(); cosignDb = null;
    queueCommittedClinicalSourceChange({ agencyId: note.agency_id, clientId: note.client_id, sourceKind: 'note', sourceId: noteId });
    const queueSynchronized = await synchronizeSupervisorQueue({...note,supervisor_cosigned_at:cosignedAtIso},queueMarker);
    if (!nonBillable) await draftClaimAfterSignature(req, persistedCosign);
    return res.json({ ok: true, noteId, cosignedAt: cosignedAtIso, supervisorCosign:supervisorSignatureReceipt(persistedCosign), isBillable: !nonBillable, queueSynchronizationPending:!queueSynchronized });
  } catch (e) {
    if(cosignDb) { await cosignDb.rollback(); cosignDb.release(); cosignDb=null; }
    next(e);
  } finally { cosignDb?.release(); }
};

export const listNotesForSigning = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const mode = String(req.query.mode || 'cosign').toLowerCase();
    let sql = `
      SELECT id, clinical_session_id, client_id, title, note_type, provider_signed_at, supervisor_cosigned_at,
             is_billable, created_by_user_id, provider_signed_by_user_id, created_at, metadata_json,
             (SELECT COUNT(*) FROM clinical_note_addenda a WHERE a.clinical_note_id=n.id AND a.agency_id=n.agency_id) AS addendum_count
      FROM clinical_notes n
      WHERE agency_id = ? AND is_deleted = 0`;
    if (mode === 'unsigned') {
      sql += ` AND provider_signed_at IS NULL AND COALESCE(content_review_source,'') <> 'provider_review'`;
    } else {
      sql += ` AND provider_signed_at IS NOT NULL AND supervisor_cosigned_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM clinical_note_revision_heads h WHERE h.clinical_note_id=n.id AND h.agency_id=n.agency_id AND (h.pending_revision_id IS NOT NULL OR h.effective_revision_id<>h.original_revision_id))`;
    }
    sql += ` ORDER BY created_at DESC LIMIT 200`;
    const [rows] = await clinicalPool.execute(sql, [agencyId]);
    const notes=[];
    const revisionWork = await listPendingRevisionWork({agencyIds:[agencyId],actorUserId:req.user.id});
    const pendingIds = new Set(revisionWork.map(item=>Number(item.clinicalNoteId)));
    for (const row of rows || []) {
      if (pendingIds.has(Number(row.id))) continue;
      if (mode !== 'unsigned') {
        if ((parseObject(row.metadata_json).reviewRequests || []).some(r=>r.action==='changes_needed'&&!r.resolvedAt)) continue;
        const policy = await resolveNoteDocumentationPolicy({ ...row, agency_id: agencyId });
        if (Number(policy.supervisorUserId) !== Number(req.user.id)) continue;
        const requiredTypes = isNonBillableDocument(row) ? await requiredDocumentReviewTypes(agencyId,row.client_id,row.created_at) : [];
        if (!documentReviewRequirement(row,policy,requiredTypes).reviewRequested) continue;
      }
      const {metadata_json,...note}=row;
      notes.push(note);
    }
    for (const item of revisionWork.filter(item=>mode==='unsigned' ? item.nextAction==='author_sign' : item.nextAction==='supervisor_sign')) {
      notes.push({id:item.clinicalNoteId,agency_id:item.agencyId,client_id:item.clientId,title:item.title,created_by_user_id:item.providerUserId,provider_signed_by_user_id:item.providerUserId,created_at:item.createdAt,clinical_revision_id:item.revisionId,revision_number:item.revisionNumber,revision_status:item.status,revision_action:item.nextAction,metadata:{dateOfService:item.dateOfService,serviceCode:item.serviceCode}});
    }
    return res.json({ notes });
  } catch (e) {
    next(e);
  }
};

export const upsertDiagnosis = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    const clientId = parseIntValue(req.body.clientId);
    const concernKind = String(req.body.concernKind || req.body.concern_kind || 'clinical')
      .trim()
      .toLowerCase() === 'learning_concern'
      ? 'learning_concern'
      : 'clinical';
    let code = String(req.body.icd10Code || req.body.icd10_code || '').trim().toUpperCase();
    const description = req.body.description ? String(req.body.description).trim().slice(0, 500) : null;
    if (!code && concernKind === 'learning_concern' && description) {
      const slug = description.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 12);
      code = `LC-${slug || Date.now().toString(36).toUpperCase()}`.slice(0, 16);
    }
    if (!agencyId || !clientId || !code) {
      return res.status(400).json({
        error: { message: 'agencyId, clientId, and icd10Code (or learning description) are required' }
      });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });

    const isPrimary = !!req.body.isPrimary;
    const justification = req.body.justification ? String(req.body.justification).trim() : null;

    const id = await upsertClinicalDiagnosis({
      agencyId,
      clientId,
      icd10Code: code,
      description,
      justification,
      createdByUserId: req.user.id,
      clinicalSessionId: parseIntValue(req.body.clinicalSessionId),
      clinicalNoteId: parseIntValue(req.body.clinicalNoteId),
      setPrimary: isPrimary,
      concernKind
    });
    return res.status(201).json({ id, icd10Code: code, concernKind });
  } catch (e) {
    next(e);
  }
};

export const listFeeSchedule = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const schedule = await getCanonicalFeeSchedule(req.user, { agencyId, mode: 'insurance', scope: 'practice' });
    return res.json({ items: schedule.rows.map(row => ({ procedure_code: row.serviceCode, description: row.description,
      unit_price_cents: row.rateCents, unit_minutes: row.unitMinutes, source: row.source, source_label: row.sourceLabel })),
      canonical: true, revision: schedule.revision });
  } catch (e) {
    next(e);
  }
};

export const upsertFeeScheduleItem = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    const procedureCode = String(req.body.procedureCode || '').trim().toUpperCase();
    if (!agencyId || !procedureCode) {
      return res.status(400).json({ error: { message: 'agencyId and procedureCode are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    return res.status(409).json({ error: { code: 'CANONICAL_FEE_SCHEDULE_REQUIRED', message: 'Manage service rates in Billing → Fee schedules. Reload that schedule before saving.' }, feeSchedulePath: `/admin/medical-billing?agencyId=${agencyId}&billingSection=fee-schedules` });
  } catch (e) {
    next(e);
  }
};

export const createMedicalClaim = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    const clientId = parseIntValue(req.body.clientId);
    const sessionId = parseIntValue(req.body.clinicalSessionId);
    let noteId = parseIntValue(req.body.clinicalNoteId);
    if (!agencyId || !clientId || !sessionId) {
      return res.status(400).json({ error: { message: 'agencyId, clientId, and clinicalSessionId are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });

    const session = await ClinicalSession.findById(sessionId);
    if (!session || Number(session.agency_id) !== agencyId || Number(session.client_id) !== clientId) {
      return res.status(404).json({ error: { message: 'Session not found for this client and agency' } });
    }
    const billingAccess = await hasSchedulingBillingAccess(req.user, agencyId);
    if (!billingAccess && Number(session.provider_user_id) !== Number(req.user.id) && req[clinicalSignatureHandoff] !== true) {
      return res.status(403).json({ error: { message: 'Only the session provider or billing team can prepare this claim' } });
    }
    if (!billingAccess) {
      req.body = { agencyId, clientId, clinicalSessionId: sessionId, clinicalNoteId: noteId };
    }

    const agency = await loadAgencyFlags(agencyId);
    const flags = getMedicalBillingFlags(agency);
    const readiness = await evaluateClaimReadiness({
      agencyId,
      clientId,
      clinicalSessionId: sessionId,
      clinicalNoteId: noteId,
      requireSignedNote: !!flags.clinicalNoteSigningEnabled
    });
    if (!noteId && readiness.noteId) noteId = readiness.noteId;
    if (!noteId) return res.status(409).json({ error: { message: 'A claim must be linked to a clinical note' } });
    let approvedNote = null, approvedSession = session;

    if (noteId) {
      const [nRows] = await clinicalPool.execute(
        `SELECT * FROM clinical_notes WHERE id = ? AND clinical_session_id = ? AND agency_id = ? AND client_id = ? AND is_deleted = 0 LIMIT 1`,
        [noteId, sessionId, agencyId, clientId]
      );
      const note = nRows?.[0];
      if (!note) return res.status(404).json({ error: { message: 'Clinical note not found' } });
      const approved = await getApprovedClinicalContext({ note, session });
      approvedNote = approved.note;
      approvedSession = approved.session;
      if (flags.clinicalNoteSigningEnabled) {
        if (!note.provider_signed_at) {
          return res.status(400).json({ error: { message: 'Note must be provider-signed before creating a claim' } });
        }
        // Pending supervisor notes may enter the billing queue as drafts; submission rechecks readiness.
      }

      // One original per encounter, even after a new note version, void or deletion.
      try {
        const [existing] = await clinicalPool.execute(
          `SELECT id, claim_status, claim_lifecycle, clinical_note_id, clinical_session_id, amount_cents
           FROM clinical_claims
           WHERE agency_id = ?
             AND clinical_session_id = ?
           ORDER BY (clinical_note_id = ?) DESC, id DESC
           LIMIT 1`,
          [agencyId, sessionId, noteId]
        );
        if (existing?.[0]?.id) {
          return res.json(await schedulingResponseForUser(req.user, agencyId, {
            claim: existing[0],
            alreadyExists: true,
            diagnosisCodes: await resolveClaimDiagnosisCodes({
              agencyId,
              clientId,
              clinicalNoteId: noteId,
              approvedNote,
              diagnosisCodes: req.body.diagnosisCodes || null
            }),
            readiness
          }));
        }
      } catch (idemErr) {
        console.warn('[createMedicalClaim] idempotency check skipped', idemErr?.message || idemErr);
      }
    }

    const sourceFunding=await savedClinicalFunding(session);
    assertNoAutomaticProBonoClaim({session,noteMetadata:parseObject(approvedNote?.metadata_json),billing:sourceFunding});
    const diagnosisCodes = await resolveClaimDiagnosisCodes({
      agencyId,
      clientId,
      clinicalNoteId: noteId,
      approvedNote,
      diagnosisCodes: req.body.diagnosisCodes || null
    });
    if (!diagnosisCodes.length) {
      return res.status(400).json({
        error: {
          message:
            'Primary diagnosis is required to create a claim. Finalize intake or add a diagnosis on the chart first.',
          readiness
        }
      });
    }

    const dateOfService = await resolveClaimDateOfService({
      clinicalSessionId: sessionId,
      clinicalNoteId: noteId,
      approvedNote,
      dateOfService: req.body.dateOfService || null
    });

    let resolvedBillingNpi = req.body.billingNpi || null;
    let resolvedRenderingNpi = req.body.renderingNpi || null;
    let claimProviderMeta = null;
    let providerResolutionFailed = false;
    {
      try {
        const { resolveClaimProviders } = await import('../services/resolveClaimProviders.service.js');
        const sess = approvedSession || {};
        const renderingProviderUserId = Number(
          sess.rendering_provider_user_id || sess.provider_user_id || req.user?.id || 0
        ) || null;
        claimProviderMeta = await resolveClaimProviders({
          agencyId,
          renderingProviderUserId,
          serviceCode: sess.service_code,
          dateOfService,
          overrideMode: req.body.claimBillingMode || null
        });
        if (!resolvedBillingNpi) resolvedBillingNpi = claimProviderMeta.billingNpi || null;
        if (!resolvedRenderingNpi) resolvedRenderingNpi = claimProviderMeta.renderingNpi || null;
      } catch (resolveErr) {
        providerResolutionFailed = true;
        console.warn('[createMedicalClaim] resolveClaimProviders failed', resolveErr?.message || resolveErr);
      }
    }

    // A selected office supplies the group billing identity. Rendering/provider
    // defaults must not silently replace it with an individual's NPI.
    const { resolveClaimMdBillingProfile } = await import('../services/claimMdBillingProfile.service.js');
    const claimBillingProfile = await resolveClaimMdBillingProfile(agencyId, sessionId, { required: false, requireComplete: false });
    if (!req.body.billingNpi && claimBillingProfile) resolvedBillingNpi = claimBillingProfile.billingNpi || null;

    let lines = Array.isArray(req.body.lines) ? req.body.lines : [];
    const sessionRow = approvedSession;

    const sessionDurationMinutes = (() => {
      if (Number(sessionRow?.duration_minutes) > 0) return Number(sessionRow.duration_minutes);
      if (!sessionRow?.scheduled_start_at || !sessionRow?.scheduled_end_at) return null;
      const a = new Date(sessionRow.scheduled_start_at).getTime();
      const b = new Date(sessionRow.scheduled_end_at).getTime();
      if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
      return Math.round((b - a) / 60000);
    })();

    if (!lines.length && noteId) {
      try {
        let meta = {};
        const rawMeta = approvedNote?.metadata_json;
        try {
          meta = typeof rawMeta === 'string' ? JSON.parse(rawMeta || '{}') : (rawMeta || {});
        } catch {
          meta = {};
        }
        let primary =
          String(meta.serviceCode || sessionRow?.service_code || req.body.primaryProcedureCode || '')
            .trim()
            .toUpperCase();
        let primaryUnits = Number(meta.billingPrimaryUnits || req.body.primaryUnits || 0) || 0;
        const approvedDetails = (meta.serviceDetailAmendments || []).filter(a => a.approvedAt).at(-1)?.serviceDetails;
        const durationMins = Number(approvedDetails?.durationMinutes ?? meta.structuredChart?.durationMinutes ?? meta.durationMinutes ?? sessionDurationMinutes ?? 0) || 0;

        // Resolve units / overflow from agency medical service codes when duration is known.
        if (primary && durationMins > 0) {
          try {
            const AgencyMedicalServiceCode = (await import('../models/AgencyMedicalServiceCode.model.js')).default;
            const {
              ruleFromMedicalServiceCodeRow,
              resolveWithOverflowChain
            } = await import('../services/serviceCodeUnits.service.js');
            const row = await AgencyMedicalServiceCode.findByAgencyAndCode(agencyId, primary);
            if (row) {
              const primaryRule = ruleFromMedicalServiceCodeRow(row);
              const codes = await AgencyMedicalServiceCode.listByAgency(agencyId, { includeInactive: false });
              const byCode = new Map(codes.map((c) => [String(c.service_code).toUpperCase(), c]));
              const resolved = resolveWithOverflowChain(durationMins, primaryRule, (code) => {
                const hit = byCode.get(String(code).toUpperCase());
                return hit ? ruleFromMedicalServiceCodeRow(hit) : null;
              });
              if (resolved?.effectiveServiceCode) primary = resolved.effectiveServiceCode;
              if (resolved?.claimable && Number(resolved.units || 0) > 0) {
                primaryUnits = Number(resolved.units);
              }
            }
          } catch (unitErr) {
            console.warn('[createMedicalClaim] unit resolve skipped', unitErr?.message || unitErr);
          }
        }
        if (!primaryUnits) primaryUnits = 1;

        if (primary) {
          lines.push({
            procedureCode: primary,
            units: primaryUnits,
            chargeCents: req.body.primaryChargeCents ?? undefined,
            diagnosisPointers: '1',
            serviceDate: dateOfService
          });
        }
        const addons = Array.isArray(meta.billingAddons) ? meta.billingAddons : [];
        for (const a of addons) {
          const code = String(a?.code || '').trim().toUpperCase();
          if (!code || code === primary) continue;
          lines.push({
            procedureCode: code,
            units: Number(a.units || 1) || 1,
            diagnosisPointers: '1',
            serviceDate: dateOfService
          });
        }
        const modifiers = Array.isArray(meta.modifiers) ? meta.modifiers : [];
        const lineModifiers = modifiers.map(m => String(m || '').trim().toUpperCase()).filter(code => /^[A-Z0-9]{2}$/.test(code));
        if (lineModifiers.length && lines[0]) lines[0] = { ...lines[0], modifiers: [...new Set([...(lines[0].modifiers || []), ...lineModifiers])] };
      } catch (lineBuildErr) {
        console.warn('[createMedicalClaim] auto line build failed', lineBuildErr?.message || lineBuildErr);
      }
    }

    let placeOfService = req.body.placeOfService || sessionRow?.place_of_service || null;
    const insuranceSnapshot = await readClientInsurance(clientId, agencyId);
    const payerName = insuranceSnapshot?.primary?.insurerName || null;
    const afterHoursPolicy=await reconcileNewClaimAfterHours({session:sessionRow,note:approvedNote,lines,metadata:parseObject(approvedNote?.metadata_json),billing:sourceFunding});
    lines=afterHoursPolicy.lines;
    if (providerResolutionFailed && lines.some(line => line.chargeCents == null || line.chargeCents === '')) throw Object.assign(new Error('Resolve the claim billing provider before applying its fee schedule.'), { status: 409 });
    lines = await priceNewClaimLines({ lines, agencyId, payerId: insuranceSnapshot?.primary?.payerId || null,
      providerUserId: claimProviderMeta?.billingUserId || claimProviderMeta?.renderingUserId || sessionRow?.rendering_provider_user_id || sessionRow?.provider_user_id || null,
      dateOfService, durationMinutes: sessionDurationMinutes });

    // Seed line modifiers from office POS template (e.g. GT for Telehealth)
    try {
      const slid = Number(approvedSession?.service_location_id || 0);
      if (slid && lines.length) {
        const loc = await AgencyServiceLocation.findById(slid);
        const mods = String(loc?.default_modifiers || '').trim();
        if (mods) {
          const parsed = mods.split(/[,\s]+/).map((m) => m.trim().toUpperCase()).filter(code => /^[A-Z0-9]{2}$/.test(code));
          if (parsed.length) {
            const current = Array.isArray(lines[0].modifiers) ? lines[0].modifiers : [];
            lines[0] = { ...lines[0], modifiers: [...new Set([...current, ...parsed])].slice(0, 4) };
          }
        }
      }
    } catch {
      // optional until migration 1406
    }

    try {
      const { applyBillingClaimOverrides } = await import('../services/applyBillingClaimOverrides.service.js');
      const overrideResult = await applyBillingClaimOverrides({
        agencyId,
        clientId,
        claimId: null,
        placeOfService,
        billingNpi: resolvedBillingNpi,
        payerName,
        payerId: insuranceSnapshot?.primary?.payerId || null,
        planType: insuranceSnapshot?.primary?.planType || null,
        dateOfService
      });
      // The stored claim keeps the visit place of service. Payer place-of-service rules apply when the claim is sent.
      if (overrideResult?.billingNpi) resolvedBillingNpi = overrideResult.billingNpi;
      const modifierOverride = (overrideResult?.applied || []).find(item => item.field === 'modifiers');
      if (modifierOverride) {
        const codes = String(modifierOverride.to || '').split(/[,\s]+/).map(code => code.trim().toUpperCase()).filter(code => /^[A-Z0-9]{2}$/.test(code));
        const only = modifierOverride.serviceCode ? String(modifierOverride.serviceCode).toUpperCase() : '';
        lines = lines.map(line => !only || String(line.procedureCode).toUpperCase() === only ? { ...line, modifiers: codes, modifierSource: 'override' } : line);
      }
    } catch (ovErr) {
      // Table may not exist until migration 1399 runs.
      if (!String(ovErr?.message || '').includes('billing_claim_overrides')) {
        console.warn('[createMedicalClaim] override apply skipped', ovErr?.message || ovErr);
      }
    }

    const clinicalBlockers = approvedVersionBillingBlockers({ note: approvedNote, claim: { date_of_service: dateOfService, place_of_service: placeOfService, diagnosis_codes_json: diagnosisCodes }, lines: lines.map(line => ({ procedure_code: line.procedureCode, units: line.units })), session: approvedSession, diagnosisCodes,afterHoursDecision:afterHoursPolicy.decision });
    if (approvedNote?.clinical_version_id && lines.some(line => line.serviceDate && String(line.serviceDate).slice(0, 10) !== dateOfService)) clinicalBlockers.push('Claim line dates must match the approved clinical version.');
    if (clinicalBlockers.length) return res.status(409).json({ error: { message: 'Claim services must match the latest approved clinical version.' }, blockers: clinicalBlockers });
    const clinicalVersion = clinicalVersionReference(approvedNote);
    const amountCents = lines.reduce((s, l) => s + Number(l.chargeCents || 0), 0);
    let claim;
    // Clinical checks alone do not establish insurance, intake documentation,
    // payer enrollment or submission readiness. Full review runs before upload.
    await assertClinicalBillingApproval({ noteId, agencyId }, clinicalPool);
    if (isNonBillableDocument(approvedNote)) throw Object.assign(new Error('This clinical document is not billable.'), {status:409});
    const claimLifecycle = 'ready';
    const draftDb = await clinicalPool.getConnection();
    try {
      await draftDb.beginTransaction();
      await draftDb.execute('SELECT id FROM clinical_sessions WHERE id = ? AND agency_id = ? FOR UPDATE', [sessionId, agencyId]);
      const [[lockedNote]] = await draftDb.execute('SELECT * FROM clinical_notes WHERE id=? AND agency_id=? FOR UPDATE', [noteId, agencyId]);
      if (!lockedNote) throw Object.assign(new Error('The clinical note is unavailable.'), { status: 409 });
      await assertClinicalBillingApproval({ noteId, agencyId }, draftDb);
      const lockedContext = await getApprovedClinicalContext({ note: lockedNote, session: approvedSession }, draftDb);
      if (clinicalVersion.revisionId !== Number(lockedContext.note.clinical_version_id) || clinicalVersion.contentHash !== lockedContext.note.clinical_version_content_hash) throw Object.assign(new Error('The approved clinical version changed. Prepare the claim again.'), { status: 409 });
      const [duplicates] = await draftDb.execute(`SELECT id FROM clinical_claims WHERE agency_id = ? AND clinical_session_id = ?`, [agencyId, sessionId]);
      if (duplicates.length) {
        await draftDb.rollback();
        return res.json(billingAccess ? { claim: duplicates[0], alreadyExists: true } : { documentationQueued: true });
      }
      claim = await ClinicalClaim.create({
      clinicalSessionId: sessionId,
      agencyId,
      clientId,
      claimNumber: req.body.claimNumber || null,
      claimStatus: 'PENDING',
      amountCents,
      currencyCode: 'USD',
      claimPayload: JSON.stringify({
        source: 'medical_billing',
        lines,
        diagnosisCodes,
        claimBillingMode: claimProviderMeta?.mode || null
      }),
      metadataJson: {
        createdVia: 'medicalBilling.createMedicalClaim',
        feeScheduleSnapshot: lines.map(line => ({ serviceCode: line.procedureCode, units: line.units, chargeCents: line.chargeCents, modifiers: line.modifiers || [], modifierSource: line.modifierSource || null, ...line.feeSource })),
        claimBillingMode: claimProviderMeta?.mode || null,
        clinicalVersion,
        scheduleDerived99051:afterHoursPolicy.policyBinding,
        billingUserId: claimProviderMeta?.billingUserId || null,
        renderingUserId: claimProviderMeta?.renderingUserId || null,
        readiness: {
          ready: readiness.ready,
          blockers: readiness.blockers,
          warnings: readiness.warnings,
          planId: readiness.planId
        }
      },
      createdByUserId: req.user.id, db: draftDb
    });

    // Claim header and service lines must commit together.
      await draftDb.execute(
        `UPDATE clinical_claims SET
           clinical_note_id = ?,
           payer_name = ?,
           destination_payer_id = ?,
           member_id = NULL,
           insurance_payload = ?,
           billing_npi = ?,
           rendering_npi = ?,
           taxonomy_code = ?,
           place_of_service = ?,
           date_of_service = ?,
           claim_lifecycle = ?,
           diagnosis_codes_json = ?
         WHERE id = ?`,
        [
          noteId,
          payerName,
          insuranceSnapshot?.primary?.payerId || null,
          insuranceSnapshot ? encryptFamilyBilling(insuranceSnapshot, `claim-insurance:${agencyId}:${claim.id}`) : null,
          resolvedBillingNpi,
          resolvedRenderingNpi,
          req.body.taxonomyCode || null,
          placeOfService,
          dateOfService,
          claimLifecycle,
          JSON.stringify(diagnosisCodes),
          claim.id
        ]
      );
      let lineNum = 1;
      for (const l of lines) {
        await draftDb.execute(
          `INSERT INTO clinical_claim_lines
           (clinical_claim_id, line_number, procedure_code, modifiers_json, units, charge_cents, diagnosis_pointers, clinical_note_id, service_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            claim.id,
            lineNum++,
            String(l.procedureCode || '').toUpperCase(),
            l.modifiers ? JSON.stringify(l.modifiers) : null,
            Number(l.units || 1),
            Number(l.chargeCents || 0),
            l.diagnosisPointers || '1',
            noteId,
            l.serviceDate || dateOfService || null
          ]
        );
      }
      await draftDb.commit();
    } catch (error) {
      await draftDb.rollback();
      throw error;
    } finally { draftDb.release(); }

    return res.status(201).json(await schedulingResponseForUser(req.user, agencyId, {
      claim: { ...claim, claim_lifecycle: claimLifecycle, date_of_service: dateOfService, clinical_note_id: noteId },
      diagnosisCodes,
      clinicalVersion,
      readiness
    }));
  } catch (e) {
    next(e);
  }
};

export const getSessionClaimReadiness = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    const clientId = parseIntValue(req.query.clientId);
    const sessionId = parseIntValue(req.params.sessionId);
    const noteId = parseIntValue(req.query.clinicalNoteId);
    if (!agencyId || !clientId || !sessionId) {
      return res.status(400).json({ error: { message: 'agencyId, clientId, and sessionId are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const agency = await loadAgencyFlags(agencyId);
    const flags = getMedicalBillingFlags(agency);
    const readiness = await evaluateClaimReadiness({
      agencyId,
      clientId,
      clinicalSessionId: sessionId,
      clinicalNoteId: noteId,
      requireSignedNote: !!flags.clinicalNoteSigningEnabled
    });
    return res.json({ readiness });
  } catch (e) {
    next(e);
  }
};

export const listMedicalClaims = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const [rows] = await clinicalPool.execute(
      `SELECT id,id AS claimId,agency_id,payer_sequence,parent_claim_id,metadata_json, clinical_session_id, client_id, claim_number, claim_status, amount_cents, currency_code,
              clinical_note_id, payer_name, claim_lifecycle, claimmd_claim_id, claimmd_last_status,
              date_of_service, diagnosis_codes_json, place_of_service, created_at, updated_at
       FROM clinical_claims
       WHERE agency_id = ? AND is_deleted = 0
       ORDER BY created_at DESC`,
      [agencyId]
    );
    const [responsibilities]=await pool.execute("SELECT r.source_key,r.id,r.amount_cents,r.status,COALESCE(SUM(a.paid_cents),0) AS paid_cents FROM family_receivables r LEFT JOIN family_receivable_allocations a ON a.receivable_id=r.id WHERE r.agency_id=? AND r.source_type='claim_responsibility' GROUP BY r.id",[agencyId]);
    const byClaim=new Map(responsibilities.map(r=>[String(r.source_key),r]));
    await attachClaimReferences(rows,clinicalPool);
    const claims=collapseClaimAttempts(rows).sort((a,b)=>Number(b.id)-Number(a.id)).slice(0,200);
    return res.json({ claims: claims.map(claim=>{const {metadata_json,...visible}=claim;return {...visible,familyResponsibility:byClaim.get(String(claim.id))||null,familyResponsibilities:claim.attempt_ids.map((id,index)=>{const balance=byClaim.get(String(id));return balance?{...balance,attemptNumber:index+1}:null;}).filter(Boolean)};}) });
  } catch (e) {
    next(e);
  }
};

export const listBillingClaimOverrideAudit = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const { listBillingClaimOverrideAudit: listAudit } = await import('../services/applyBillingClaimOverrides.service.js');
    return res.json({ items: await listAudit(agencyId, parseIntValue(req.query.overrideId)) });
  } catch (e) {
    next(e);
  }
};

const ADJUSTMENT_DESCRIPTIONS = {
  '4': 'The procedure code is inconsistent with the modifier, or a modifier is missing.',
  '45': 'The charge is above the fee schedule or contracted amount.',
  '16': 'The claim or service line is missing information needed for adjudication.',
  '96': 'This service is not a covered benefit for this payer.',
  '97': 'This service is included in another service on the claim.',
  '18': 'This is a duplicate claim or service.'
};

export const listClaimAdjustments = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    const claimId = parseIntValue(req.params.claimId);
    if (!agencyId || !claimId) return res.status(400).json({ error: { message: 'agencyId and claimId are required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const [rows] = await clinicalPool.execute(`SELECT line_number, procedure_code, group_code, reason_code, amount_cents, allowed_cents, remark_codes_json, created_at
      FROM claimmd_remittance_adjustments WHERE agency_id = ? AND clinical_claim_id = ? ORDER BY line_number, id`, [agencyId, claimId]);
    return res.json({ items: (rows || []).map(row => ({ ...row, description: ADJUSTMENT_DESCRIPTIONS[String(row.reason_code)] || `Adjustment ${row.group_code}-${row.reason_code}` })) });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return res.json({ items: [] });
    next(e);
  }
};

export const listBillingSuggestions = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const { listBillingSuggestions: list } = await import('../services/billingOutcomeLearning.service.js');
    return res.json({ items: await list(agencyId) });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return res.json({ items: [] });
    next(e);
  }
};

export const decideBillingSuggestion = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const { decideBillingSuggestion: decide } = await import('../services/billingOutcomeLearning.service.js');
    return res.json(await decide({ agencyId, suggestionId: parseIntValue(req.params.suggestionId), decision: req.body.decision, actorUserId: req.user.id, modifier: req.body.modifier, planType: req.body.planType, effectiveFrom: req.body.effectiveFrom, effectiveThrough: req.body.effectiveThrough, policyReference: req.body.policyReference, reason: req.body.reason }));
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const listBillingClaimOverrides = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const { listBillingClaimOverrides: listRows } = await import(
      '../services/applyBillingClaimOverrides.service.js'
    );
    const items = await listRows(agencyId);
    return res.json({ items });
  } catch (e) {
    next(e);
  }
};

export const upsertBillingClaimOverride = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const { upsertBillingClaimOverride: upsert } = await import(
      '../services/applyBillingClaimOverrides.service.js'
    );
    const row = await upsert({
      ...req.body,
      agencyId,
      createdByUserId: req.user.id,
      updatedByUserId: req.user.id
    });
    return res.json({ item: row });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const saveClaimMdCredentials = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    const accountKey = String(req.body.accountKey || '').trim();
    if (!agencyId || !accountKey) {
      return res.status(400).json({ error: { message: 'agencyId and accountKey are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    if (!isChatEncryptionConfigured()) {
      return res.status(500).json({ error: { message: 'Encryption key not configured; cannot store Claim.MD AccountKey' } });
    }
    const { ciphertextB64, ivB64, authTagB64, keyId } = encryptChatText(accountKey);
    const envelope = JSON.stringify({
      _enc: true,
      keyId,
      iv: ivB64,
      tag: authTagB64,
      ciphertext: ciphertextB64
    });
    await AgencyClaimMdCredentials.upsert({
      agencyId,
      accountId: req.body.accountId ? String(req.body.accountId) : null,
      accountKeyEnc: envelope,
      actorUserId: req.user.id
    });
    return res.json({ ok: true, meta: await AgencyClaimMdCredentials.publicMeta(agencyId) });
  } catch (e) {
    next(e);
  }
};

async function resolveClaimMdAccountKey(agencyId) {
  return (await resolveClaimMdConnection(agencyId)).accountKey;
}

export const submitClaimToClaimMd = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    const claimId = parseIntValue(req.params.claimId);
    if (!agencyId || !claimId || req.body.approved !== true || !/^[a-f0-9]{64}$/.test(req.body.reviewHash || '')) {
      return res.status(400).json({ error: { message: 'Review and explicitly approve this claim before submitting' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    if (await isSyntheticClearinghouseAgency(agencyId)) {
      const { claim, readiness, insurance, payload, reviewHash, supervision, documentation } = await prepareClaimReview(agencyId, claimId);
      const clinicalVersion = clinicalVersionReference(documentation?.note);
      if (!['ready', 'draft', 'rejected'].includes(claim.claim_lifecycle)) return res.status(409).json({ error: { message: 'This claim is already submitted, in progress, or needs reconciliation' } });
      if (!readiness.ready) return res.status(409).json({ error: { message: 'Clinical documentation is not ready for submission' }, readiness });
      if (reviewHash !== req.body.reviewHash) return res.status(409).json({ error: { message: 'Claim data changed since review. Review the updated claim before submitting.' } });
      const attemptId = crypto.randomUUID();
      const connectionId = `practice:${agencyId}`;
      const db = await clinicalPool.getConnection();
      try {
        await db.beginTransaction();
        await db.execute('SELECT id FROM clinical_sessions WHERE id=? AND agency_id=? FOR UPDATE', [claim.clinical_session_id, agencyId]);
        await assertNoSelfPayBalance(agencyId, claim.clinical_session_id);
        await db.execute('SELECT id FROM clinical_claims WHERE id = ? AND agency_id = ? FOR UPDATE', [claimId, agencyId]);
        await db.execute('SELECT id FROM clinical_notes WHERE id = ? AND agency_id = ? FOR UPDATE', [claim.clinical_note_id || null, agencyId]);
        await db.execute('SELECT id FROM clinical_note_addenda WHERE clinical_note_id = ? AND agency_id = ? FOR UPDATE', [claim.clinical_note_id || null, agencyId]);
        const latestReview = await prepareClaimReview(agencyId, claimId);
        if (!latestReview.readiness.ready || latestReview.reviewHash !== reviewHash) throw Object.assign(new Error('Documentation or billing policy changed. Review this claim again.'), { status: 409 });
        await assertClinicalVersionSubmission({ noteId: claim.clinical_note_id, agencyId, expectedRevisionId: clinicalVersion.revisionId, expectedContentHash: clinicalVersion.contentHash }, db);
        await assertOriginalTransmissionAllowed({ ...latestReview.claim, agency_id: agencyId }, db);
        const practiceClaimId = `practice-${claimId}`;
        const [queued] = await db.execute(`UPDATE clinical_claims SET claim_lifecycle = 'submitted', claim_status = 'SUBMITTED', member_id = NULL,
          insurance_payload = ?, claimmd_connection_id = ?, rendering_npi = ?, destination_payer_id = ?,
          claimmd_last_status = 'PRACTICE', claimmd_submitted_at = NOW(), claimmd_claim_id = ?, claim_number = ?
          WHERE id = ? AND agency_id = ? AND is_deleted = 0
          AND claim_lifecycle IN ('ready','draft','rejected') AND billing_revision = ?`,
          [encryptFamilyBilling(insurance, `claim-insurance:${agencyId}:${claimId}`), connectionId, payload.prov_npi || null, payload.payerid || null, practiceClaimId, payload.pcn, claimId, agencyId, claim.billing_revision]);
        if (!queued.affectedRows) throw Object.assign(new Error('This claim changed or is already being submitted. Refresh its review.'), { status: 409 });
        await recordClaimEvent({ agencyId, claimId, connectionId, eventKey: `practice:${attemptId}`, eventType: 'approved_submission', status: 'PRACTICE', actorUserId: req.user.id, payload: { reviewHash, clinicalVersion, mode: 'practice', practice: true, payload, supervision, appliedOverrides: latestReview.appliedOverrides || [] } }, db);
        await recordClaimEvent({ agencyId, claimId, connectionId, eventKey: `practice-ack:${attemptId}`, eventType: 'acknowledgement', status: 'PRACTICE', actorUserId: req.user.id, payload: { messages: [{ message: 'Practice acknowledgement. This claim was not sent to Claim.MD or a payer.', status: 'PRACTICE' }], claimMdId: practiceClaimId } }, db);
        await db.commit();
      } catch (e) { await db.rollback(); throw e; } finally { db.release(); }
      return res.json({ ok: true, accepted: true, practice: true, message: 'Practice submission recorded in this app. Nothing was sent to Claim.MD or a payer.' });
    }
    await assertLiveClearinghouseAgency(agencyId);
    const connection = await resolveClaimMdConnection(agencyId);
    requireClaimMdTransmission(connection);
    if (req.body.accountMode !== connection.mode) return res.status(409).json({ error: { message: 'The connection mode changed. Review the account mode again.' } });
    const { claim, readiness, insurance, payload, reviewHash, supervision, documentation } = await prepareClaimReview(agencyId, claimId);
    const clinicalVersion = clinicalVersionReference(documentation?.note);
    if (!['ready', 'draft', 'rejected'].includes(claim.claim_lifecycle)) return res.status(409).json({ error: { message: 'This claim is already submitted, in progress, or needs reconciliation' } });
    if (claim.claimmd_connection_id && claim.claimmd_connection_id !== connection.connectionId) return res.status(409).json({ error: { message: 'Reconcile the claim in its original Claim.MD account before changing accounts' } });
    if (!readiness.ready) return res.status(409).json({ error: { message: 'Clinical documentation is not ready for submission' }, readiness });
    if (reviewHash !== req.body.reviewHash) return res.status(409).json({ error: { message: 'Claim data changed since review. Review the updated claim before submitting.' } });
    const attemptId = crypto.randomUUID();
    const feeUsageId=await reserveMedicalServiceUsage({agencyId,kind:'claim',sourceId:Number(claimId)});
    const db = await clinicalPool.getConnection();
    try {
      await db.beginTransaction();
      await db.execute('SELECT id FROM clinical_sessions WHERE id=? AND agency_id=? FOR UPDATE',[claim.clinical_session_id,agencyId]);
      await assertNoSelfPayBalance(agencyId,claim.clinical_session_id);
      await db.execute('SELECT id FROM clinical_claims WHERE id = ? AND agency_id = ? FOR UPDATE',[claimId,agencyId]);
      await db.execute('SELECT id FROM clinical_notes WHERE id = ? AND agency_id = ? FOR UPDATE',[claim.clinical_note_id || null,agencyId]);
      await db.execute('SELECT id FROM clinical_note_addenda WHERE clinical_note_id = ? AND agency_id = ? FOR UPDATE',[claim.clinical_note_id || null,agencyId]);
      const latestReview = await prepareClaimReview(agencyId,claimId);
      if (!latestReview.readiness.ready || latestReview.reviewHash !== reviewHash) throw Object.assign(new Error('Documentation or billing policy changed. Review this claim again.'),{status:409});
      await assertClinicalVersionSubmission({ noteId: claim.clinical_note_id, agencyId, expectedRevisionId: clinicalVersion.revisionId, expectedContentHash: clinicalVersion.contentHash }, db);
      await assertOriginalTransmissionAllowed({...latestReview.claim,agency_id:agencyId},db);
      await assertAssistantBillingCommand(req);
      const [queued] = await db.execute(`UPDATE clinical_claims SET claim_lifecycle = 'queued', member_id = NULL,
        insurance_payload = ?, claimmd_connection_id = ?, rendering_npi = ?, destination_payer_id = ?, claim_number = ? WHERE id = ? AND agency_id = ? AND is_deleted = 0
        AND claim_lifecycle IN ('ready','draft','rejected') AND billing_revision = ?`,
        [encryptFamilyBilling(insurance, `claim-insurance:${agencyId}:${claimId}`), connection.connectionId, payload.prov_npi || null, payload.payerid || null, payload.pcn, claimId, agencyId, claim.billing_revision]);
      if (!queued.affectedRows) throw Object.assign(new Error('This claim changed or is already being submitted. Refresh its review.'), { status: 409 });
      await recordClaimEvent({ agencyId, claimId, connectionId: connection.connectionId, eventKey: `submission:${attemptId}`,
        eventType: 'approved_submission', actorUserId: req.user.id, payload: { reviewHash, clinicalVersion, mode: connection.mode, payload,
          ...(assistantBillingAuthorization(req)?{authorization:assistantBillingAuthorization(req)}:{}),
          supervision, appliedOverrides: latestReview.appliedOverrides || [] } }, db);
      await db.commit();
    } catch (e) { await db.rollback(); throw e; } finally { db.release(); }
    // A transport failure stays queued: never automatically repeat a possibly successful upload.
    const result = await uploadClaims({ agencyId, accountKey: connection.accountKey, fileContents: JSON.stringify({ claim: [payload] }), filename: `claim-${claimId}.json` });
    const ack = asList(result.claim).find(row => String(row.remote_claimid || '') === String(payload.remote_claimid));
    if (!ack?.claimmd_id && !ack?.claimid) throw Object.assign(new Error('Claim.MD did not acknowledge this claim. Reconcile its status before retrying.'), { status: 502 });
    const accepted = ack.status === 'A';
    const lifecycle = accepted ? 'submitted' : ack.status === 'R' ? 'rejected' : 'queued';
    const ackDb = await clinicalPool.getConnection();
    try {
      await ackDb.beginTransaction();
      await recordClaimEvent({ agencyId, claimId, connectionId: connection.connectionId, eventKey: `ack:${attemptId}`,
        eventType: 'acknowledgement', status: ack.status || null, payload: { messages: asList(ack.messages), claimMdId: String(ack.claimmd_id || ack.claimid) } }, ackDb);
      await ackDb.execute(`UPDATE clinical_claims SET claim_lifecycle = ?, claim_status = ?, claimmd_last_status = ?,
        claimmd_submitted_at = NOW(), claimmd_claim_id = ? WHERE id = ? AND agency_id = ? AND claim_lifecycle = 'queued'`,
        [lifecycle, accepted ? 'SUBMITTED' : 'PENDING', String(ack.status || 'unknown'), String(ack.claimmd_id || ack.claimid), claimId, agencyId]);
      await ackDb.commit();
    } catch (e) { await ackDb.rollback(); throw e; } finally { ackDb.release(); }
    await completeMedicalServiceUsage(feeUsageId,agencyId);
    return res.json({ ok: true, accepted, message: accepted
      ? 'Acknowledged by Claim.MD. Payer transmission may still require approval in the Claim.MD portal.'
      : 'Claim.MD returned an issue. Review the claim history before taking further action.' });
  } catch (e) { next(e); }
};

export const refreshClaimMdResponses = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId || req.body.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const connection = await resolveClaimMdConnection(agencyId);
    return res.json(await syncClaimMdResponses({ agencyId, connection }));
  } catch (e) { next(e); }
};

export const listClaimMdEras = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const accountKey = await resolveClaimMdAccountKey(agencyId);
    const practice = await Agency.findById(agencyId);
    const taxId = String(practice.tax_id || '').replace(/\D/g, '');
    if (taxId.length !== 9) return res.status(409).json({ error: { message: 'Configure the agency tax ID first' } });
    const { assertExclusiveClaimMdTaxId } = await import('../services/claimMdBillingProfile.service.js');
    await assertExclusiveClaimMdTaxId(agencyId, taxId);
    const result = await fetchEraList({ agencyId, accountKey, page: req.query.page || '1', taxId });
    const eras = asList(result.era).filter(row => taxId.length === 9 && String(row.prov_taxid || '').replace(/\D/g, '') === taxId);
    return res.json({ eras });
  } catch (e) {
    next(e);
  }
};

export const checkClaimMdEligibility = async (req, res) => {
  return res.status(410).json({ error: { message: 'Use the client insurance verification screen so eligibility evidence is scoped and saved to the client and date of service.' } });
};

/** Parse Documentation Hub panels into goals array for saveTreatmentPlanToChart. */
export function panelsToTreatmentPlanGoals(panels = []) {
  const goals = [];
  let current = null;
  for (const p of panels) {
    if (p.kind === 'goal' || /^Goal\s*\d+/i.test(p.id || p.title || '')) {
      current = {
        goalIndex: p.index || goals.length + 1,
        goalText: p.text || '',
        projectedCompletion: null,
        objectives: []
      };
      goals.push(current);
    } else if (current && (p.kind === 'objective' || /^Objective\s*\d+/i.test(p.id || p.title || ''))) {
      current.objectives.push({
        objectiveIndex: p.index || current.objectives.length + 1,
        objectiveText: p.text || ''
      });
    } else if (current && (p.kind === 'projected_time' || /^Projected/i.test(p.id || p.title || ''))) {
      current.projectedCompletion = p.text || '';
    }
  }
  return goals;
}

export const encryptPayloadForChart = maybeEncryptNotePayload;
export const decryptPayloadFromChart = maybeDecryptNotePayload;

const billingReportFiltersFromRequest = (req) => ({
  startDate: req.query.startDate || null,
  endDate: req.query.endDate || null,
  clientId: req.query.clientId || null,
  providerId: req.query.providerId || null,
  status: req.query.status || null,
  serviceCode: req.query.serviceCode || null,
  payer: req.query.payer || null,
  placeOfService: req.query.placeOfService || null,
  search: req.query.search || null
});

const numericReportSummary = (summary = {}) => Object.fromEntries(
  Object.entries(summary).map(([key, value]) => [key, Number(value || 0)])
);

const billingCsvEscape = (value) => {
  let output = value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) output = value.toISOString();
  else if (value && typeof value === 'object') output = JSON.stringify(value);
  const str = output == null ? '' : String(output);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

/** Report definitions used by the Medical Billing report builder. */
export const listMedicalBillingReportCatalog = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    return res.json({ reports: await getBillingReportCatalog() });
  } catch (e) {
    next(e);
  }
};

/** Run a filtered, read-only report over the medical billing data plane. */
export const runMedicalBillingReport = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const result = await executeBillingReport({
      agencyId,
      type: req.query.type || 'claims',
      filters: billingReportFiltersFromRequest(req),
      limit,
      offset
    });
    return res.json({
      report: result.report,
      rows: result.rows,
      summary: numericReportSummary(result.summary),
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasNextPage: result.offset + result.rows.length < result.total
      },
      readOnly: true,
      notice: result.notice || null
    });
  } catch (e) {
    next(e);
  }
};

/** Export all filtered report rows (up to 10,000) as CSV. */
export const exportMedicalBillingReportCsv = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const result = await executeBillingReport({
      agencyId,
      type: req.query.type || 'claims',
      filters: billingReportFiltersFromRequest(req),
      limit: 10000,
      offset: 0
    });
    const columns = result.report.columns || [];
    const lines = [columns.map((column) => billingCsvEscape(column.label)).join(',')];
    for (const row of result.rows || []) {
      lines.push(columns.map((column) => billingCsvEscape(row[column.key])).join(','));
    }
    const safeType = String(result.report.type || 'report').replace(/[^a-z0-9_-]/gi, '-');
    const filename = `medical-billing-${safeType}-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(lines.join('\n'));
  } catch (e) {
    next(e);
  }
};

export const listMedicalServiceCodes = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    try {
      const { ensureAgencyMedicalBillingDefaults } = await import('../services/medicalBillingDefaults.service.js');
      await ensureAgencyMedicalBillingDefaults(agencyId, { actorUserId: req.user.id });
    } catch (cause) {
      const { catalogSynchronizationError } = await import('../services/agencyServiceCodeCatalog.service.js');
      throw catalogSynchronizationError(cause);
    }
    try {
      const { reconcileAgencyServiceCodeCatalog } = await import('../services/agencyServiceCodeCatalog.service.js');
      await reconcileAgencyServiceCodeCatalog(agencyId, { actorUserId: req.user.id });
    } catch (cause) {
      const { catalogSynchronizationError } = await import('../services/agencyServiceCodeCatalog.service.js');
      throw catalogSynchronizationError(cause);
    }
    const items = await AgencyMedicalServiceCode.listByAgency(agencyId, {
      includeInactive: String(req.query.includeInactive || '') === '1'
    });
    return res.json(await schedulingResponseForUser(req.user, agencyId, { items }));
  } catch (e) {
    next(e);
  }
};

export const upsertMedicalServiceCode = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    const serviceCode = String(req.body.serviceCode || '').trim().toUpperCase();
    if (!agencyId || !serviceCode) {
      return res.status(400).json({ error: { message: 'agencyId and serviceCode are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });

    let ladderBandsJson = req.body.ladderBands || req.body.ladderBandsJson || null;
    const mode = String(req.body.unitCalcMode || 'SINGLE').toUpperCase();
    if (!ladderBandsJson && mode === 'MEDICAID_8_MINUTE_LADDER') {
      ladderBandsJson = buildMedicaid8MinuteBands({
        unitMinutes: req.body.unitMinutes || 15,
        maxUnits: req.body.maxUnitsPerSession || 12,
        minMinutes: req.body.minMinutes || 8
      });
    }

    const allowedCredentialTiers = Array.isArray(req.body.allowedCredentialTiers)
      ? req.body.allowedCredentialTiers
      : (typeof req.body.allowedCredentialTiers === 'string' && req.body.allowedCredentialTiers.trim()
        ? req.body.allowedCredentialTiers.split(',').map((t) => t.trim()).filter(Boolean)
        : null);

    const allowedPlaceOfService = Array.isArray(req.body.allowedPlaceOfService)
      ? req.body.allowedPlaceOfService
      : (typeof req.body.allowedPlaceOfService === 'string' && req.body.allowedPlaceOfService.trim()
        ? req.body.allowedPlaceOfService.split(',').map((t) => t.trim()).filter(Boolean)
        : null);

    const existingCode = await AgencyMedicalServiceCode.findByAgencyAndCode(agencyId, serviceCode);
    const { isClinicalAddon } = await import('../utils/clinicalServiceCodeCatalog.js');
    const isAddon = isClinicalAddon(serviceCode) || (req.body.isAddon !== undefined
      ? [true, 1, '1', 'true'].includes(req.body.isAddon)
      : !!existingCode?.isAddon);
    const isActive = req.body.isActive !== false;
    const item = await AgencyMedicalServiceCode.upsert({
      agencyId,
      serviceCode,
      description: req.body.description || null,
      unitCalcMode: mode,
      unitMinutes: req.body.unitMinutes ?? null,
      minMinutes: req.body.minMinutes ?? null,
      maxMinutes: req.body.maxMinutes ?? null,
      maxUnitsPerSession: req.body.maxUnitsPerSession ?? null,
      maxUnitsPerDay: req.body.maxUnitsPerDay ?? null,
      ladderBandsJson,
      overflowServiceCode: req.body.overflowServiceCode || null,
      overflowAtMinutes: req.body.overflowAtMinutes ?? null,
      defaultPlaceOfService: req.body.defaultPlaceOfService || null,
      allowedPlaceOfService,
      allowedCredentialTiers,
      isAddon,
      isActive,
      sessionMode: req.body.sessionMode || req.body.session_mode || 'either',
      createdByUserId: req.user.id
    });

    if (
      req.body.missedBillingMode !== undefined
      || req.body.missedBillingServiceCode !== undefined
      || req.body.missedBillingTriggers !== undefined
    ) {
      try {
        await AgencyMedicalServiceCode.updateMissedBillingOverride(agencyId, serviceCode, {
          missedBillingMode: req.body.missedBillingMode ?? 'none',
          missedBillingServiceCode: req.body.missedBillingServiceCode ?? null,
          missedBillingTriggers: req.body.missedBillingTriggers ?? 'no_show,late_cancel'
        });
      } catch (e) {
        if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      }
    }

    try {
      const {
        syncClinicalCodePresent,
        removeServiceCodeEverywhere
      } = await import('../services/agencyServiceCodeCatalog.service.js');
      if (!isActive) {
        await removeServiceCodeEverywhere(agencyId, serviceCode, {
          skipMedical: true,
          forceAllSurfaces: true
        });
      } else {
        await syncClinicalCodePresent(agencyId, serviceCode, { actorUserId: req.user.id });
      }
    } catch (cause) {
      const { catalogSynchronizationError } = await import('../services/agencyServiceCodeCatalog.service.js');
      throw catalogSynchronizationError(cause);
    }

    return res.status(201).json({ item });
  } catch (e) {
    next(e);
  }
};

export const previewServiceCodeUnits = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId || req.query.agencyId);
    const serviceCode = String(req.body.serviceCode || req.query.serviceCode || '').trim().toUpperCase();
    const minutes = Number(req.body.minutes || req.query.minutes || 0);
    if (!agencyId || !serviceCode) {
      return res.status(400).json({ error: { message: 'agencyId and serviceCode are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });

    const row = await AgencyMedicalServiceCode.findByAgencyAndCode(agencyId, serviceCode);
    if (!row) {
      return res.status(404).json({ error: { message: `No medical service code ${serviceCode} for this agency` } });
    }
    const primary = ruleFromMedicalServiceCodeRow(row);
    const codes = await AgencyMedicalServiceCode.listByAgency(agencyId, { includeInactive: false });
    const byCode = new Map(codes.map((c) => [String(c.service_code).toUpperCase(), c]));
    const result = resolveWithOverflowChain(minutes, primary, (code) => {
      const hit = byCode.get(String(code).toUpperCase());
      return hit ? ruleFromMedicalServiceCodeRow(hit) : null;
    });
    return res.json({
      ...result,
      maxUnitsPerDay: primary.maxUnitsPerDay || null,
      maxUnitsPerSession: primary.maxUnitsPerSession || null,
      ladderBands: primary.ladderBandsJson
        || (String(primary.unitCalcMode).toUpperCase() === 'MEDICAID_8_MINUTE_LADDER'
          ? buildMedicaid8MinuteBands({
            unitMinutes: primary.unitMinutes || 15,
            maxUnits: primary.maxUnitsPerSession || 12,
            minMinutes: primary.minMinutes || 8
          })
          : null)
    });
  } catch (e) {
    next(e);
  }
};

export const listServiceLocations = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    if (String(req.query.forNoteAid || '') === '1') return res.json({choices:await assignedNoteLocations(req.user.id,agencyId)});
    const items = await AgencyServiceLocation.listByAgency(agencyId, {
      includeInactive: String(req.query.includeInactive || '') === '1'
    });
    const offices = await OfficeLocation.findBillingByAgency(agencyId);
    const affiliated = await OrganizationAffiliation.listActiveOrganizationsForAgency(agencyId).catch(() => []);
    const schools = (affiliated || []).filter((org) => {
      const t = String(org.organization_type || '').toLowerCase();
      return !t || t === 'school' || t === 'program';
    }).map((org) => ({ id: org.id, name: org.name || `School #${org.id}` }));
    let groupNpis = [];
    try {
      const [npiRows] = await pool.execute(
        `SELECT id, npi_number, label, taxonomy_code, office_location_id, notes, is_active
         FROM agency_group_npis
         WHERE agency_id = ? AND is_active = 1
         ORDER BY office_location_id, id`,
        [agencyId]
      );
      groupNpis = npiRows || [];
    } catch {
      groupNpis = [];
    }
    return res.json({ items, billingOffices: offices || [], schools, groupNpis });
  } catch (e) {
    next(e);
  }
};

export const createServiceLocation = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    const name = String(req.body.name || '').trim();
    const placeOfService = String(req.body.placeOfService || '').trim();
    if (!agencyId || !name || !placeOfService) {
      return res.status(400).json({ error: { message: 'agencyId, name, and placeOfService are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const item = await AgencyServiceLocation.create({
      agencyId,
      name,
      placeOfService,
      streetAddress: req.body.streetAddress || null,
      city: req.body.city || null,
      state: req.body.state || null,
      postalCode: req.body.postalCode || null,
      notes: req.body.notes || null,
      requiresCredentialing: !!req.body.requiresCredentialing,
      billingOfficeLocationId: parseIntValue(req.body.billingOfficeLocationId),
      schoolOrganizationId: parseIntValue(req.body.schoolOrganizationId),
      createdByUserId: req.user.id
    });
    return res.status(201).json({ item });
  } catch (e) {
    next(e);
  }
};

/**
 * Find-or-create a POS 03 school service location for booking.
 * Claims still bill under the tenant billing office; school is the clinical site only.
 */
export const ensureSchoolServiceLocation = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    const schoolOrganizationId = parseIntValue(req.body.schoolOrganizationId);
    if (!agencyId || !schoolOrganizationId) {
      return res.status(400).json({ error: { message: 'agencyId and schoolOrganizationId are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });

    const { ensureSchoolServiceLocation } = await import('../services/officeBillingSites.service.js');
    const existing = await AgencyServiceLocation.findByAgencyAndSchool(agencyId, schoolOrganizationId);
    const item = await ensureSchoolServiceLocation({
      agencyId,
      schoolOrganizationId,
      actorUserId: req.user.id,
      billingOfficeLocationId: parseIntValue(req.body.billingOfficeLocationId)
    });
    if (!item) return res.status(404).json({ error: { message: 'School organization not found' } });
    return res.status(existing ? 200 : 201).json({ item, created: !existing });
  } catch (e) {
    next(e);
  }
};

export const updateBillingOffice = async (req, res, next) => {
  try {
    const id = parseIntValue(req.params.officeId);
    const agencyId = parseIntValue(req.body.agencyId);
    if (!id || !agencyId) return res.status(400).json({ error: { message: 'officeId and agencyId are required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const existing = await OfficeLocation.findById(id);
    if (!existing || Number(existing.agency_id) !== agencyId) {
      return res.status(404).json({ error: { message: 'This billing office belongs to the practice that owns the building.' } });
    }
    const practiceNpi = req.body.practiceNpi === undefined ? undefined : String(req.body.practiceNpi || '').replace(/\D/g, '');
    if (practiceNpi !== undefined && practiceNpi && !/^\d{10}$/.test(practiceNpi)) {
      return res.status(400).json({ error: { message: 'The practice NPI must be 10 digits.' } });
    }
    const updates = {};
    if (req.body.name !== undefined) updates.name = String(req.body.name || '').slice(0, 255);
    if (req.body.practiceName !== undefined) updates.practice_name = String(req.body.practiceName || '').slice(0, 255);
    if (req.body.claimFacilityName !== undefined) updates.claim_facility_name = req.body.claimFacilityName;
    if (req.body.streetAddress !== undefined) updates.street_address = String(req.body.streetAddress || '').slice(0, 255);
    if (req.body.city !== undefined) updates.city = String(req.body.city || '').slice(0, 128);
    if (req.body.state !== undefined) updates.state = String(req.body.state || '').slice(0, 64);
    if (req.body.postalCode !== undefined) updates.postal_code = String(req.body.postalCode || '').slice(0, 32);
    if (req.body.phone !== undefined) updates.phone = String(req.body.phone || '').slice(0, 40);
    if (practiceNpi !== undefined) updates.practice_npi = practiceNpi || null;
    if (req.body.taxonomyCode !== undefined) updates.taxonomy_code = String(req.body.taxonomyCode || '').slice(0, 32);
    const item = await OfficeLocation.update(id, updates);
    return res.json({ item });
  } catch (e) {
    next(e);
  }
};

export const updateServiceLocation = async (req, res, next) => {
  try {
    const id = parseIntValue(req.params.locationId);
    const agencyId = parseIntValue(req.body.agencyId);
    if (!id || !agencyId) return res.status(400).json({ error: { message: 'locationId and agencyId are required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const existing = await AgencyServiceLocation.findById(id);
    if (!existing || Number(existing.agency_id) !== agencyId) {
      return res.status(404).json({ error: { message: 'Service location not found' } });
    }
    const item = await AgencyServiceLocation.update(id, {
      name: req.body.name,
      placeOfService: req.body.placeOfService,
      streetAddress: req.body.streetAddress,
      city: req.body.city,
      state: req.body.state,
      postalCode: req.body.postalCode,
      notes: req.body.notes,
      requiresCredentialing: req.body.requiresCredentialing,
      billingOfficeLocationId: req.body.billingOfficeLocationId === null
        ? null
        : parseIntValue(req.body.billingOfficeLocationId),
      schoolOrganizationId: req.body.schoolOrganizationId === null
        ? null
        : parseIntValue(req.body.schoolOrganizationId),
      isActive: req.body.isActive
    });
    return res.json({ item });
  } catch (e) {
    next(e);
  }
};

/**
 * Apply service code + location + unit resolution onto a clinical session (encounter).
 */
export const applyEncounterBilling = async (req, res, next) => {
  try {
    const sessionId = parseIntValue(req.params.sessionId);
    const agencyId = parseIntValue(req.body.agencyId);
    const session = await ClinicalSession.findById(sessionId);
    if (!session) return res.status(404).json({ error: { message: 'Clinical session not found' } });
    const aid = agencyId || Number(session.agency_id);
    if (Number(session.agency_id) !== aid) return res.status(404).json({ error: { message: 'Clinical session not found for this agency' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId: aid });

    const serviceCode = String(req.body.serviceCode || session.service_code || '').trim().toUpperCase();
    const [[signedSource]]=await clinicalPool.execute('SELECT id FROM clinical_notes WHERE clinical_session_id=? AND agency_id=? AND provider_signed_at IS NOT NULL LIMIT 1',[sessionId,aid]);
    if(signedSource) return res.status(409).json({error:{message:'For a signed encounter, request service-code/unit changes through a signed note amendment. Use the claim billing editor for supported claim-only POS/modifier corrections.'}});
    const minutes = Number(req.body.durationMinutes ?? session.duration_minutes ?? 0);
    const serviceLocationId = parseIntValue(req.body.serviceLocationId) || session.service_location_id || null;
    let billingOfficeLocationId =
      parseIntValue(req.body.billingOfficeLocationId) || session.billing_office_location_id || null;
    let placeOfService = req.body.placeOfService || session.place_of_service || null;
    const modifiers = req.body.modifiers != null
      ? String(req.body.modifiers || '').trim()
      : (session.modifiers || null);
    const reason = String(req.body.reason || req.body.amendmentReason || '').trim() || null;

    let location = null;
    if (serviceLocationId) {
      location = await AgencyServiceLocation.findById(serviceLocationId);
      if (location && Number(location.agency_id) === aid) {
        placeOfService = placeOfService || location.place_of_service;
        billingOfficeLocationId = billingOfficeLocationId || location.billing_office_location_id || null;
      }
    }

    let resolution = null;
    if (serviceCode && minutes > 0) {
      const row = await AgencyMedicalServiceCode.findByAgencyAndCode(aid, serviceCode);
      if (row) {
        const primary = ruleFromMedicalServiceCodeRow(row);
        const codes = await AgencyMedicalServiceCode.listByAgency(aid);
        const byCode = new Map(codes.map((c) => [String(c.service_code).toUpperCase(), c]));
        resolution = resolveWithOverflowChain(minutes, primary, (code) => {
          const hit = byCode.get(String(code).toUpperCase());
          return hit ? ruleFromMedicalServiceCodeRow(hit) : null;
        });
        placeOfService = placeOfService || primary.defaultPlaceOfService || null;
      }
    }

    try {
      await clinicalPool.execute(
        `UPDATE clinical_sessions SET
           service_code = ?,
           effective_service_code = ?,
           service_location_id = ?,
           billing_office_location_id = ?,
           place_of_service = ?,
           duration_minutes = ?,
           billed_units = ?,
           claim_blocked_reason = CASE WHEN claim_blocked_reason LIKE 'SELF_PAY_ONLY:%'
             OR encounter_status IN ('no_show', 'cancelled', 'canceled', 'voided', 'rescheduled')
             THEN claim_blocked_reason ELSE ? END,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          serviceCode || null,
          resolution?.effectiveServiceCode || serviceCode || null,
          serviceLocationId,
          billingOfficeLocationId,
          placeOfService || null,
          minutes || null,
          resolution?.claimable ? resolution.units : null,
          resolution && !resolution.claimable ? resolution.reason : null,
          sessionId
        ]
      );
    } catch (schemaErr) {
      return res.status(500).json({
        error: {
          message: 'Clinical session billing columns missing. Run clinical migration 003_session_service_code_location.sql',
          details: schemaErr?.message
        }
      });
    }

    const diffs = [];
    const track = (fieldKey, fromValue, toValue) => {
      const from = fromValue == null ? '' : String(fromValue);
      const to = toValue == null ? '' : String(toValue);
      if (from === to) return;
      diffs.push({ fieldKey, fromValue: from || null, toValue: to || null });
    };
    track('service_code', session.service_code, serviceCode);
    track('service_location_id', session.service_location_id, serviceLocationId);
    track('place_of_service', session.place_of_service, placeOfService);
    track('billing_office_location_id', session.billing_office_location_id, billingOfficeLocationId);
    track('duration_minutes', session.duration_minutes, minutes);

    let linkedNoteId = parseIntValue(req.body.clinicalNoteId) || null;
    if (!linkedNoteId) {
      try {
        const [nRows] = await clinicalPool.execute(
          `SELECT id FROM clinical_notes
           WHERE clinical_session_id = ? AND is_deleted = 0
           ORDER BY provider_signed_at IS NULL, id DESC
           LIMIT 1`,
          [sessionId]
        );
        linkedNoteId = nRows?.[0]?.id || null;
      } catch {
        linkedNoteId = null;
      }
    }

    for (const d of diffs) {
      await insertBillingAmendment({
        sessionId,
        noteId: linkedNoteId,
        agencyId: aid,
        userId: req.user.id,
        fieldKey: d.fieldKey,
        fromValue: d.fromValue,
        toValue: d.toValue,
        reason
      });
    }

    if (diffs.length) {
      ActivityLogService.logActivity({
        userId: req.user.id,
        agencyId: aid,
        actionType: 'clinical_note_billing_amended',
        metadata: {
          sessionId,
          noteId: linkedNoteId,
          changes: diffs,
          reason
        }
      }, req);
      if (linkedNoteId) {
        try {
          const [noteRows] = await clinicalPool.execute(
            `SELECT metadata_json FROM clinical_notes WHERE id = ? LIMIT 1`,
            [linkedNoteId]
          );
          let noteMeta = {};
          try {
            const raw = noteRows?.[0]?.metadata_json;
            noteMeta = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
          } catch {
            noteMeta = {};
          }
          noteMeta.billingAmendments = [
            ...(Array.isArray(noteMeta.billingAmendments) ? noteMeta.billingAmendments : []),
            {
              at: new Date().toISOString(),
              byUserId: req.user.id,
              reason,
              changes: diffs
            }
          ];
          await clinicalPool.execute(
            `UPDATE clinical_notes SET metadata_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [JSON.stringify(noteMeta), linkedNoteId]
          );
        } catch {
          // metadata is best-effort
        }
      }
    }

    const updated = await ClinicalSession.findById(sessionId);
    return res.json({
      session: updated,
      billing: resolution,
      serviceLocation: location,
      billingAddressNote:
        'Claims bill under the linked office address (billing_office_location_id); service location POS is stored on the encounter/note.'
    });
  } catch (e) {
    next(e);
  }
};

export const listClinicalInterventions = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const catalog = await ClinicalInterventionCatalog.listMerged({
      agencyId,
      userId: req.user.id
    });
    return res.json(catalog);
  } catch (e) {
    next(e);
  }
};

export const addClinicalInterventions = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const scope = String(req.body.scope || 'user').toLowerCase() === 'agency' ? 'agency' : 'user';
    const role = String(req.user?.role || '').toLowerCase();
    if (scope === 'agency' && !['admin', 'super_admin', 'support'].includes(role)) {
      return res.status(403).json({
        error: { message: 'Only admin, super admin, or support can add agency default interventions.' }
      });
    }
    const names = Array.isArray(req.body.names)
      ? req.body.names
      : String(req.body.name || req.body.names || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const catalog = await ClinicalInterventionCatalog.addMany({
      agencyId,
      userId: scope === 'agency' ? 0 : req.user.id,
      names,
      createdByUserId: req.user.id
    });
    return res.json(catalog);
  } catch (e) {
    next(e);
  }
};

export const createClinicalNoteAddendum = async (req, res, next) => {
  try {
    const noteId = parseIntValue(req.params.noteId);
    const bodyText = String(req.body.body || req.body.addendum || '').trim();
    if (!noteId || !bodyText) {
      return res.status(400).json({ error: { message: 'Note id and addendum text are required.' } });
    }
    const note = await ClinicalNote.findById(noteId);
    if (!note || note.is_deleted) return res.status(404).json({ error: { message: 'Note not found' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId: note.agency_id });
    if (!note.provider_signed_at) {
      return res.status(400).json({ error: { message: 'Addenda can be attached after the note is signed.' } });
    }
    const policy = await resolveNoteDocumentationPolicy(note);
    if (![Number(note.created_by_user_id), Number(note.provider_signed_by_user_id), policy.supervisorUserId].includes(Number(req.user.id))) {
      return res.status(403).json({ error: { message: 'Only the note author or assigned supervisor can add a clinical amendment.' } });
    }
    assertClinicalSigner(req.user);
    if (req.body.serviceLines !== undefined || !['addendum','late_entry'].includes(req.body.entryKind)) {
      return res.status(409).json({error:{message:'Create a linked amended version for corrections to signed content or billing details. Addenda add independently signed information.'}});
    }
    const addition = await appendRevisionAddendum({noteId,agencyId:note.agency_id,actorUserId:req.user.id,
      body:bodyText,entryKind:req.body.entryKind,reason:req.body.reason,authorAttested:req.body.authorAttested});
    await logAuditEvent(req, {agencyId:note.agency_id,actionType:'clinical_note_addendum_added',targetType:'clinical_note',targetId:noteId,
      metadata:{noteId,clientId:Number(note.client_id),revisionId:addition.revisionId,signatureId:addition.signatureId,contentHash:addition.contentHash}});
    return res.status(201).json({addenda:await listNoteAddenda(noteId),addition,supervisorSignoffRequired:false,claimTransmitted:false});
  } catch (e) {
    next(e);
  }
};

export const getTreatmentPlanRenewalPolicy = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.agencyId);
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    res.json({ policy: await loadRenewalPolicy(agencyId) });
  } catch (e) { next(e); }
};
export const saveTreatmentPlanRenewalPolicy = async (req, res, next) => {
  try {
    const agencyId = Number(req.params.agencyId);
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    if (!['admin', 'super_admin'].includes(req.user.role)) return res.status(403).json({ error: { message: 'Agency administrator access required.' } });
    const p = req.body;
    if (typeof p.flagEnabled !== 'boolean' || typeof p.forceUpdate !== 'boolean' || !Number.isInteger(p.flagAfterDays) || !Number.isInteger(p.renewAfterDays) || p.flagAfterDays < 1 || p.renewAfterDays < p.flagAfterDays || p.renewAfterDays > 3650 || (p.renewByDate && (!/^\d{4}-\d{2}-\d{2}$/.test(p.renewByDate) || !Number.isFinite(Date.parse(p.renewByDate))))) {
      return res.status(400).json({ error: { message: 'Use valid renewal settings: flag days must be between 1 and the renewal interval (up to 3650 days).' } });
    }
    const policy = { flagEnabled: p.flagEnabled, forceUpdate: p.forceUpdate, flagAfterDays: p.flagAfterDays, renewAfterDays: p.renewAfterDays, renewByDate: p.renewByDate || null };
    await pool.execute("UPDATE agencies SET treatment_plan_max_age_days = ?, feature_flags = JSON_SET(COALESCE(feature_flags, JSON_OBJECT()), '$.treatmentPlanRenewal', CAST(? AS JSON)) WHERE id = ?", [policy.renewAfterDays, JSON.stringify(policy), agencyId]);
    res.json({ policy });
  } catch (e) { next(e); }
};

async function shareSavedPlanToGuardians(plan, actorUserId) {
  try {
    const { shareGuardianPlanRevision } = await import('../services/guardianPlanProgress.service.js');
    return await shareGuardianPlanRevision({ plan, actorUserId });
  } catch (error) {
    console.warn('[treatment-plan] Guardian sharing needs a retry:', error?.code || error?.status || 'unavailable');
    return { shared: 0, needsRetry: true, message: 'The plan was saved, but guardian sharing needs to be retried from the acknowledgment panel.' };
  }
}
