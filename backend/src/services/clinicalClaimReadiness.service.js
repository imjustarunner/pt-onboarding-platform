import clinicalPool from '../config/clinicalDatabase.js';
import { getPrimaryClinicalDiagnosis } from './clinicalDiagnosisAttach.service.js';

function safeInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function isoDate(v) {
  if (!v) return null;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve diagnosis codes for a claim from note primary dx, chart primary, or body override.
 */
export async function resolveClaimDiagnosisCodes({
  agencyId,
  clientId,
  clinicalNoteId = null,
  diagnosisCodes = null
}) {
  if (Array.isArray(diagnosisCodes) && diagnosisCodes.length) {
    return diagnosisCodes.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean);
  }
  if (diagnosisCodes && typeof diagnosisCodes === 'object' && !Array.isArray(diagnosisCodes)) {
    const vals = Object.values(diagnosisCodes)
      .map((c) => String(c || '').trim().toUpperCase())
      .filter(Boolean);
    if (vals.length) return vals;
  }

  const noteId = safeInt(clinicalNoteId);
  if (noteId) {
    try {
      const [rows] = await clinicalPool.execute(
        `SELECT n.primary_diagnosis_id, d.icd10_code
         FROM clinical_notes n
         LEFT JOIN clinical_diagnoses d ON d.id = n.primary_diagnosis_id
         WHERE n.id = ?
         LIMIT 1`,
        [noteId]
      );
      const code = rows?.[0]?.icd10_code ? String(rows[0].icd10_code).trim().toUpperCase() : null;
      if (code) return [code];
    } catch (e) {
      if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
    }
  }

  const primary = await getPrimaryClinicalDiagnosis({ agencyId, clientId });
  if (primary?.icd10_code) return [String(primary.icd10_code).trim().toUpperCase()];
  return [];
}

/**
 * Resolve date of service for a claim from body, note metadata, or session schedule.
 */
export async function resolveClaimDateOfService({
  clinicalSessionId,
  clinicalNoteId = null,
  dateOfService = null
}) {
  const fromBody = isoDate(dateOfService);
  if (fromBody) return fromBody;

  const noteId = safeInt(clinicalNoteId);
  if (noteId) {
    try {
      const [rows] = await clinicalPool.execute(
        `SELECT metadata_json, created_at FROM clinical_notes WHERE id = ? LIMIT 1`,
        [noteId]
      );
      const meta = rows?.[0]?.metadata_json;
      let parsed = meta;
      if (typeof meta === 'string') {
        try {
          parsed = JSON.parse(meta);
        } catch {
          parsed = null;
        }
      }
      const fromMeta = isoDate(parsed?.dateOfService || parsed?.date_of_service);
      if (fromMeta) return fromMeta;
    } catch {
      /* ignore */
    }
  }

  const sessionId = safeInt(clinicalSessionId);
  if (sessionId) {
    const [rows] = await clinicalPool.execute(
      `SELECT scheduled_start_at, created_at FROM clinical_sessions WHERE id = ? LIMIT 1`,
      [sessionId]
    );
    const fromSession = isoDate(rows?.[0]?.scheduled_start_at || rows?.[0]?.created_at);
    if (fromSession) return fromSession;
  }
  return null;
}

/**
 * Claim readiness checklist for a clinical session (note + dx + treatment plan).
 */
export async function evaluateClaimReadiness({
  agencyId,
  clientId,
  clinicalSessionId,
  clinicalNoteId = null,
  requireSignedNote = false
}) {
  const agency = safeInt(agencyId);
  const client = safeInt(clientId);
  const sessionId = safeInt(clinicalSessionId);
  const checks = {
    hasSession: !!sessionId,
    hasNote: false,
    noteSigned: false,
    noteBillable: false,
    hasPrimaryDiagnosis: false,
    hasDiagnosisCode: false,
    hasActiveTreatmentPlan: false,
    treatmentPlanHasPrimaryDx: false,
    dateOfService: null
  };
  const blockers = [];
  const warnings = [];

  if (!agency || !client || !sessionId) {
    blockers.push('agencyId, clientId, and clinicalSessionId are required');
    return { ready: false, checks, blockers, warnings, diagnosisCodes: [], noteId: null, planId: null };
  }

  let noteId = safeInt(clinicalNoteId);
  let note = null;
  const selectNoteFull = `SELECT id, clinical_session_id, provider_signed_at, supervisor_cosigned_at, is_billable,
              primary_diagnosis_id, metadata_json, created_at
       FROM clinical_notes`;
  const selectNoteLegacy = `SELECT id, clinical_session_id, provider_signed_at, supervisor_cosigned_at, is_billable,
                  metadata_json, created_at
           FROM clinical_notes`;

  async function loadNoteById(id) {
    try {
      const [rows] = await clinicalPool.execute(`${selectNoteFull} WHERE id = ? LIMIT 1`, [id]);
      return rows?.[0] || null;
    } catch (e) {
      if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
      const [rows] = await clinicalPool.execute(`${selectNoteLegacy} WHERE id = ? LIMIT 1`, [id]);
      return rows?.[0] || null;
    }
  }

  async function loadLatestNoteForSession(sid) {
    try {
      const [rows] = await clinicalPool.execute(
        `${selectNoteFull}
         WHERE clinical_session_id = ?
         ORDER BY COALESCE(provider_signed_at, created_at) DESC, id DESC
         LIMIT 1`,
        [sid]
      );
      return rows?.[0] || null;
    } catch (e) {
      if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
      const [rows] = await clinicalPool.execute(
        `${selectNoteLegacy}
           WHERE clinical_session_id = ?
           ORDER BY COALESCE(provider_signed_at, created_at) DESC, id DESC
           LIMIT 1`,
        [sid]
      );
      return rows?.[0] || null;
    }
  }

  if (noteId) {
    note = await loadNoteById(noteId);
  }
  if (!note) {
    note = await loadLatestNoteForSession(sessionId);
    noteId = note?.id || null;
  }

  checks.hasNote = !!noteId;
  if (!noteId) blockers.push('No clinical note on this session');
  if (note) {
    checks.noteSigned = !!note.provider_signed_at;
    checks.noteBillable = !!(note.is_billable || note.supervisor_cosigned_at);
    if (requireSignedNote && !note.provider_signed_at) {
      blockers.push('Note must be provider-signed');
    } else if (!note.provider_signed_at) {
      warnings.push('Note is not yet provider-signed');
    }
  }

  const primary = await getPrimaryClinicalDiagnosis({ agencyId: agency, clientId: client });
  checks.hasPrimaryDiagnosis = !!(primary?.id || note?.primary_diagnosis_id);
  const diagnosisCodes = await resolveClaimDiagnosisCodes({
    agencyId: agency,
    clientId: client,
    clinicalNoteId: noteId
  });
  checks.hasDiagnosisCode = diagnosisCodes.length > 0;
  if (!checks.hasDiagnosisCode) {
    blockers.push('Primary diagnosis code missing — finalize intake or add diagnosis on chart');
  }

  let planId = null;
  try {
    const [plans] = await clinicalPool.execute(
      `SELECT id, status, primary_diagnosis_id, created_at
       FROM clinical_treatment_plans
       WHERE agency_id = ? AND client_id = ? AND (status IS NULL OR status NOT IN ('void','superseded','deleted'))
       ORDER BY created_at DESC
       LIMIT 1`,
      [agency, client]
    );
    const plan = plans?.[0] || null;
    planId = plan?.id || null;
    checks.hasActiveTreatmentPlan = !!planId;
    checks.treatmentPlanHasPrimaryDx = !!(plan?.primary_diagnosis_id);
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR') {
      const [plans] = await clinicalPool.execute(
        `SELECT id, status, created_at
         FROM clinical_treatment_plans
         WHERE agency_id = ? AND client_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
        [agency, client]
      );
      planId = plans?.[0]?.id || null;
      checks.hasActiveTreatmentPlan = !!planId;
    } else {
      throw e;
    }
  }
  if (!checks.hasActiveTreatmentPlan) {
    warnings.push('No active treatment plan on chart');
  } else if (!checks.treatmentPlanHasPrimaryDx) {
    warnings.push('Latest treatment plan is missing primary diagnosis link');
  }

  checks.dateOfService = await resolveClaimDateOfService({
    clinicalSessionId: sessionId,
    clinicalNoteId: noteId
  });

  const ready = blockers.length === 0;
  return {
    ready,
    checks,
    blockers,
    warnings,
    diagnosisCodes,
    noteId,
    planId,
    primaryDiagnosis: primary
      ? {
          id: primary.id,
          icd10Code: primary.icd10_code,
          description: primary.description || null,
          justification: primary.justification || null
        }
      : null
  };
}

export default {
  evaluateClaimReadiness,
  resolveClaimDiagnosisCodes,
  resolveClaimDateOfService
};
