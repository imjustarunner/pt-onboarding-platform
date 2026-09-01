import crypto from 'crypto';
import { validationResult } from 'express-validator';
import clinicalPool from '../config/clinicalDatabase.js';
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
import { encryptChatText, decryptChatText, isChatEncryptionConfigured } from '../services/chatEncryption.service.js';
import {
  uploadClaims,
  fetchResponses,
  fetchEraList,
  requestEligibilityJson,
  buildClaimMdJsonClaim
} from '../services/claimMd.service.js';
import pool from '../config/database.js';
import AgencyMedicalServiceCode from '../models/AgencyMedicalServiceCode.model.js';
import AgencyServiceLocation from '../models/AgencyServiceLocation.model.js';
import OfficeLocation from '../models/OfficeLocation.model.js';
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

function parseIntValue(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function contentHash(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
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
    const claimMd = flags.claimMdEnabled ? await AgencyClaimMdCredentials.publicMeta(agencyId) : { configured: false };
    return res.json({ flags, claimMd });
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

    // Allow creating/updating primary dx inline from Note Aid
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

    const plan = await ClinicalTreatmentPlan.create({
      agencyId,
      clientId,
      clinicalSessionId: clinicalSessionId || null,
      clinicalNoteId: parseIntValue(req.body.clinicalNoteId),
      title: String(req.body.title || 'Treatment Plan').trim(),
      effectiveDate: req.body.effectiveDate || req.body.effective_date || null,
      dischargePlan: req.body.dischargePlan ? String(req.body.dischargePlan) : null,
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
          measurementMethod: o.measurementMethod || null
        }))
      }))
    });

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
    return res.status(201).json({ plan: refreshed, primaryDiagnosisId: primaryDiagnosisId || null });
  } catch (e) {
    next(e);
  }
};

/** Parse pasted treatment plan text into a review model (no persistence). */
export const parseTreatmentPlanImport = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    const clientId = parseIntValue(req.body.clientId);
    if (!agencyId || !clientId) {
      return res.status(400).json({ error: { message: 'agencyId and clientId are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const { parseTreatmentPlanText } = await import('../services/treatmentPlanImport.service.js');
    const parsed = parseTreatmentPlanText(req.body.text || req.body.planText || '');
    return res.json({ parsed });
  } catch (e) {
    next(e);
  }
};

/** Suggest a 1–10 scale rewrite for an imported objective (clinician approves in UI). */
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
    const { suggestObjectiveScaleRewrite } = await import(
      '../services/treatmentPlanObjectiveNormalize.service.js'
    );
    const suggestion = await suggestObjectiveScaleRewrite(objectiveText);
    if (!suggestion) {
      return res.status(502).json({ error: { message: 'Could not generate a 1–10 scale suggestion' } });
    }
    return res.json({ suggestion });
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

    const scope = await collectChartScope({ clientId, agencyId });
    const chartAgencyIds = scope.agencyIds.length ? scope.agencyIds : [agencyId];
    const chartClientIds = scope.clientIds.length ? scope.clientIds : [clientId];
    const agencyIn = chartAgencyIds.map(() => '?').join(',');
    const clientIn = chartClientIds.map(() => '?').join(',');

    const [notes] = await clinicalPool.execute(
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
    const plans = await ClinicalTreatmentPlan.listByClient({ agencyId, clientId });
    const {
      pickAuthoritativeTreatmentPlan,
      resolvePrimaryDiagnosisForChart,
      presentingProblemFromPlan
    } = await import('../services/treatmentPlanPrecedence.service.js');
    const authoritativeMeta = pickAuthoritativeTreatmentPlan(plans);
    // Prefer authoritative (imported) plan over a newer empty intake auto-draft.
    let latestPlanId = Number(authoritativeMeta?.id || plans?.[0]?.id || 0);
    if (!authoritativeMeta && plans?.length) {
      const withGoals = plans.find((p) => !String(p.title || '').match(/^Intake Treatment Plan/i));
      latestPlanId = Number(withGoals?.id || plans[0].id || 0);
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
        // One justification for the diagnosis set — keep it on primary only.
        justification:
          Number(d.id) === primaryId
            ? (resolvedPrimary.justification || d.justification)
            : null
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

    return res.json({
      notes: notes || [],
      plans: plans || [],
      latestPlan: latestPlan || null,
      diagnoses: diagnoses || [],
      presentingProblem: presentingProblem || null,
      sessions: sessions || [],
      billingEncounters,
      objectiveRatings,
      noteAidDrafts,
      intakeNotes
    });
  } catch (e) {
    next(e);
  }
};

export const createObjectiveRating = async (req, res, next) => {
  try {
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
    const previousValue =
      req.body.previousScaleValue != null
        ? Number(req.body.previousScaleValue)
        : objective.scale_current != null
          ? Number(objective.scale_current)
          : null;

    const progressLabel =
      disposition === 'rated'
        ? computeProgressLabel({
            previousValue,
            newValue: scaleValue,
            target
          })
        : null;

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
      dateOfService: req.body.dateOfService ? String(req.body.dateOfService).slice(0, 10) : null,
      notes: req.body.notes ? String(req.body.notes).trim() : null
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
    return res.json({ ratings });
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

    return res.json({ plan });
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
    const agencyId = parseIntValue(req.query.agencyId);
    if (!noteId || !agencyId) {
      return res.status(400).json({ error: { message: 'noteId and agencyId are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });

    const note = await ClinicalNote.findById(noteId);
    if (!note || note.is_deleted) {
      return res.status(404).json({ error: { message: 'Note not found' } });
    }
    if (Number(note.agency_id) !== agencyId) {
      return res.status(403).json({ error: { message: 'Note belongs to a different organization' } });
    }

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

    return res.json({
      note: {
        id: note.id,
        agencyId: note.agency_id,
        clientId: note.client_id,
        title: note.title,
        noteType: note.note_type || metadata?.noteType || null,
        serviceCode: metadata?.serviceCode || null,
        clinicalSessionId,
        officeEventId,
        standalone,
        providerSignedAt: note.provider_signed_at || null,
        supervisorCosignedAt: note.supervisor_cosigned_at || null,
        dateOfService: metadata?.dateOfService || null,
        createdAt: note.created_at,
        updatedAt: note.updated_at,
        outputJson,
        metadata
      }
    });
  } catch (e) {
    next(e);
  }
};

export const signClinicalNote = async (req, res, next) => {
  try {
    const noteId = parseIntValue(req.params.noteId);
    const [rows] = await clinicalPool.execute(`SELECT * FROM clinical_notes WHERE id = ? LIMIT 1`, [noteId]);
    const note = rows?.[0];
    if (!note || note.is_deleted) return res.status(404).json({ error: { message: 'Note not found' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId: note.agency_id });

    const plain = maybeDecryptNotePayload(note.note_payload);
    const hash = contentHash(plain);
    await clinicalPool.execute(
      `UPDATE clinical_notes
       SET provider_signed_at = NOW(),
           provider_signed_by_user_id = ?,
           content_hash = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [req.user.id, hash, noteId]
    );
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
    return res.json({ ok: true, noteId, contentHash: hash, signedAt: new Date().toISOString() });
  } catch (e) {
    next(e);
  }
};

export const cosignClinicalNote = async (req, res, next) => {
  try {
    const noteId = parseIntValue(req.params.noteId);
    const [rows] = await clinicalPool.execute(`SELECT * FROM clinical_notes WHERE id = ? LIMIT 1`, [noteId]);
    const note = rows?.[0];
    if (!note || note.is_deleted) return res.status(404).json({ error: { message: 'Note not found' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId: note.agency_id });
    if (!note.provider_signed_at) {
      return res.status(400).json({ error: { message: 'Provider must sign before supervisor cosign' } });
    }
    await clinicalPool.execute(
      `UPDATE clinical_notes
       SET supervisor_cosigned_at = NOW(),
           supervisor_cosigned_by_user_id = ?,
           is_billable = 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [req.user.id, noteId]
    );
    return res.json({ ok: true, noteId, cosignedAt: new Date().toISOString(), isBillable: true });
  } catch (e) {
    next(e);
  }
};

export const listNotesForSigning = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const mode = String(req.query.mode || 'cosign').toLowerCase();
    let sql = `
      SELECT id, clinical_session_id, client_id, title, note_type, provider_signed_at, supervisor_cosigned_at,
             is_billable, created_by_user_id, created_at
      FROM clinical_notes
      WHERE agency_id = ? AND is_deleted = 0`;
    if (mode === 'unsigned') {
      sql += ` AND provider_signed_at IS NULL`;
    } else {
      sql += ` AND provider_signed_at IS NOT NULL AND supervisor_cosigned_at IS NULL`;
    }
    sql += ` ORDER BY created_at DESC LIMIT 200`;
    const [rows] = await clinicalPool.execute(sql, [agencyId]);
    return res.json({ notes: rows || [] });
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
    const [rows] = await clinicalPool.execute(
      `SELECT * FROM medical_fee_schedule_items WHERE agency_id = ? AND is_active = 1 ORDER BY procedure_code ASC`,
      [agencyId]
    );
    return res.json({ items: rows || [] });
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
    const [result] = await clinicalPool.execute(
      `INSERT INTO medical_fee_schedule_items
       (agency_id, payer_label, procedure_code, modifier, description, unit_price_cents, unit_minutes, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        agencyId,
        req.body.payerLabel || null,
        procedureCode,
        req.body.modifier || null,
        req.body.description || null,
        Number(req.body.unitPriceCents || 0),
        parseIntValue(req.body.unitMinutes)
      ]
    );
    return res.status(201).json({ id: result.insertId });
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

    if (noteId) {
      const [nRows] = await clinicalPool.execute(
        `SELECT id, provider_signed_at, supervisor_cosigned_at, is_billable FROM clinical_notes WHERE id = ? LIMIT 1`,
        [noteId]
      );
      const note = nRows?.[0];
      if (!note) return res.status(404).json({ error: { message: 'Clinical note not found' } });
      if (flags.clinicalNoteSigningEnabled) {
        if (!note.provider_signed_at) {
          return res.status(400).json({ error: { message: 'Note must be provider-signed before creating a claim' } });
        }
        if (!note.supervisor_cosigned_at && !note.is_billable) {
          return res.status(400).json({ error: { message: 'Note must be supervisor-cosigned before creating a claim' } });
        }
      }
    }

    const diagnosisCodes = await resolveClaimDiagnosisCodes({
      agencyId,
      clientId,
      clinicalNoteId: noteId,
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
      dateOfService: req.body.dateOfService || null
    });

    const lines = Array.isArray(req.body.lines) ? req.body.lines : [];
    const amountCents = lines.reduce((s, l) => s + Number(l.chargeCents || 0), 0);
    const claim = await ClinicalClaim.create({
      clinicalSessionId: sessionId,
      agencyId,
      clientId,
      claimNumber: req.body.claimNumber || null,
      claimStatus: 'PENDING',
      amountCents,
      currencyCode: 'USD',
      claimPayload: JSON.stringify({ source: 'medical_billing', lines, diagnosisCodes }),
      metadataJson: {
        createdVia: 'medicalBilling.createMedicalClaim',
        readiness: {
          ready: readiness.ready,
          blockers: readiness.blockers,
          warnings: readiness.warnings,
          planId: readiness.planId
        }
      },
      createdByUserId: req.user.id
    });

    const claimLifecycle = readiness.ready && noteId ? 'ready' : 'draft';

    // Best-effort lifecycle columns (requires migration 002)
    try {
      await clinicalPool.execute(
        `UPDATE clinical_claims SET
           clinical_note_id = ?,
           payer_name = ?,
           member_id = ?,
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
          req.body.payerName || null,
          req.body.memberId || null,
          req.body.billingNpi || null,
          req.body.renderingNpi || null,
          req.body.taxonomyCode || null,
          req.body.placeOfService || null,
          dateOfService,
          claimLifecycle,
          JSON.stringify(diagnosisCodes),
          claim.id
        ]
      );
      let lineNum = 1;
      for (const l of lines) {
        await clinicalPool.execute(
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
    } catch (schemaErr) {
      console.warn('[medicalBilling] claim line insert skipped (run clinical migration 002):', schemaErr?.message);
    }

    return res.status(201).json({
      claim: { ...claim, claim_lifecycle: claimLifecycle, date_of_service: dateOfService, clinical_note_id: noteId },
      diagnosisCodes,
      readiness
    });
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
      `SELECT id, clinical_session_id, client_id, claim_number, claim_status, amount_cents, currency_code,
              clinical_note_id, payer_name, claim_lifecycle, claimmd_claim_id, claimmd_last_status,
              date_of_service, diagnosis_codes_json, created_at, updated_at
       FROM clinical_claims
       WHERE agency_id = ? AND is_deleted = 0
       ORDER BY created_at DESC
       LIMIT 200`,
      [agencyId]
    );
    return res.json({ claims: rows || [] });
  } catch (e) {
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
  const row = await AgencyClaimMdCredentials.findByAgencyId(agencyId);
  if (!row?.account_key_enc) {
    const err = new Error('Claim.MD credentials are not configured for this agency');
    err.status = 400;
    throw err;
  }
  const parsed = JSON.parse(row.account_key_enc);
  return decryptChatText({
    ciphertextB64: parsed.ciphertext,
    ivB64: parsed.iv,
    authTagB64: parsed.tag,
    keyId: parsed.keyId
  });
}

export const submitClaimToClaimMd = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    const claimId = parseIntValue(req.params.claimId || req.body.claimId);
    if (!agencyId || !claimId) {
      return res.status(400).json({ error: { message: 'agencyId and claimId are required' } });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const accountKey = await resolveClaimMdAccountKey(agencyId);

    const [cRows] = await clinicalPool.execute(
      `SELECT * FROM clinical_claims WHERE id = ? AND agency_id = ? LIMIT 1`,
      [claimId, agencyId]
    );
    const claim = cRows?.[0];
    if (!claim) return res.status(404).json({ error: { message: 'Claim not found' } });

    const [lines] = await clinicalPool.execute(
      `SELECT * FROM clinical_claim_lines WHERE clinical_claim_id = ? ORDER BY line_number ASC`,
      [claimId]
    );
    const payload = buildClaimMdJsonClaim(claim, lines || []);
    const result = await uploadClaims({
      accountKey,
      fileContents: JSON.stringify({ claims: [payload] }),
      filename: `claim-${claimId}.json`
    });

    await clinicalPool.execute(
      `UPDATE clinical_claims SET
         claim_lifecycle = 'submitted',
         claim_status = 'SUBMITTED',
         claimmd_last_status = ?,
         claimmd_submitted_at = NOW(),
         claimmd_claim_id = COALESCE(?, claimmd_claim_id),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        typeof result === 'object' ? JSON.stringify(result).slice(0, 120) : String(result).slice(0, 120),
        result?.claimid || result?.ClaimID || result?.claims?.[0]?.claimid || null,
        claimId
      ]
    );

    return res.json({
      ok: true,
      message: 'Submitted to Claim.MD (may require portal approval before payer transmit)',
      result
    });
  } catch (e) {
    next(e);
  }
};

export const refreshClaimMdResponses = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId || req.body.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const accountKey = await resolveClaimMdAccountKey(agencyId);
    const responseId = String(req.query.responseId || req.body.responseId || '0');
    const result = await fetchResponses({ accountKey, responseId });
    return res.json({ result });
  } catch (e) {
    next(e);
  }
};

export const listClaimMdEras = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.query.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const accountKey = await resolveClaimMdAccountKey(agencyId);
    const result = await fetchEraList({ accountKey, page: req.query.page || '1' });
    return res.json({ result });
  } catch (e) {
    next(e);
  }
};

export const checkClaimMdEligibility = async (req, res, next) => {
  try {
    const agencyId = parseIntValue(req.body.agencyId);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const accountKey = await resolveClaimMdAccountKey(agencyId);
    const result = await requestEligibilityJson({ accountKey, payload: req.body.eligibility || {} });
    return res.json({ result });
  } catch (e) {
    next(e);
  }
};

/** Parse Note Aid panels into goals array for saveTreatmentPlanToChart. */
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
    } catch {
      // ignore seed failures
    }
    try {
      const { reconcileAgencyServiceCodeCatalog } = await import('../services/agencyServiceCodeCatalog.service.js');
      await reconcileAgencyServiceCodeCatalog(agencyId, { actorUserId: req.user.id });
    } catch {
      // ignore sync failures
    }
    const items = await AgencyMedicalServiceCode.listByAgency(agencyId, {
      includeInactive: String(req.query.includeInactive || '') === '1'
    });
    return res.json({ items });
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
      isActive,
      createdByUserId: req.user.id
    });

    // Best-effort: ensure code exists in scheduling dictionary so calendar can select it
    try {
      await pool.execute(
        `INSERT INTO scheduling_service_codes (service_code, description, is_active)
         VALUES (?, ?, 1)
         ON DUPLICATE KEY UPDATE description = COALESCE(VALUES(description), description), is_active = 1`,
        [serviceCode, req.body.description || null]
      );
    } catch {
      // table/columns may differ
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
    } catch {
      /* best-effort catalog sync */
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
    const items = await AgencyServiceLocation.listByAgency(agencyId, {
      includeInactive: String(req.query.includeInactive || '') === '1'
    });
    const offices = await OfficeLocation.findByAgencyMembership(agencyId, { includeInactive: false }).catch(() =>
      OfficeLocation.findByAgency(agencyId, { includeInactive: false })
    );
    return res.json({ items, billingOffices: offices || [] });
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

    const [schoolRows] = await pool.execute(
      `SELECT id, name FROM agencies
       WHERE id = ?
         AND LOWER(COALESCE(organization_type, '')) = 'school'
       LIMIT 1`,
      [schoolOrganizationId]
    );
    const school = schoolRows?.[0];
    if (!school) {
      return res.status(404).json({ error: { message: 'School organization not found' } });
    }

    let item = await AgencyServiceLocation.findByAgencyAndSchool(agencyId, schoolOrganizationId);
    if (item) return res.json({ item, created: false });

    let billingOfficeLocationId = parseIntValue(req.body.billingOfficeLocationId);
    if (!billingOfficeLocationId) {
      const offices = await OfficeLocation.findByAgencyMembership(agencyId, { includeInactive: false }).catch(() =>
        OfficeLocation.findByAgency(agencyId, { includeInactive: false })
      );
      billingOfficeLocationId = Number(offices?.[0]?.id || 0) || null;
    }

    item = await AgencyServiceLocation.create({
      agencyId,
      name: String(school.name || '').trim() || `School #${schoolOrganizationId}`,
      placeOfService: '03',
      notes: 'Auto-added school site. Claims bill under the tenant billing office + POS.',
      requiresCredentialing: false,
      billingOfficeLocationId,
      schoolOrganizationId,
      createdByUserId: req.user.id
    });
    return res.status(201).json({ item, created: true });
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
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId: aid });

    const serviceCode = String(req.body.serviceCode || session.service_code || '').trim().toUpperCase();
    const minutes = Number(req.body.durationMinutes ?? session.duration_minutes ?? 0);
    const serviceLocationId = parseIntValue(req.body.serviceLocationId) || session.service_location_id || null;
    let billingOfficeLocationId =
      parseIntValue(req.body.billingOfficeLocationId) || session.billing_office_location_id || null;
    let placeOfService = req.body.placeOfService || session.place_of_service || null;

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
           claim_blocked_reason = ?,
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
