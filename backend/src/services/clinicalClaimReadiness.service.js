import { evaluateClientDiagnosisPolicy } from './clinicalDiagnosisPolicy.service.js';
import { utcDateToZonedYmd } from '../utils/zonedWallTime.util.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { getPrimaryClinicalDiagnosis } from './clinicalDiagnosisAttach.service.js';
import { getApprovedClinicalContext, clinicalVersionBillingState } from './clinicalNoteVersionBilling.service.js';

async function approvedNoteById(noteId, agencyId = null, clientId = null) {
  if (!safeInt(noteId)) return null;
  const [[note]] = await clinicalPool.execute(`SELECT * FROM clinical_notes WHERE id = ?${safeInt(agencyId) ? ' AND agency_id = ?' : ''}${safeInt(clientId) ? ' AND client_id = ?' : ''} AND is_deleted = 0 LIMIT 1`,
    [Number(noteId), ...(safeInt(agencyId) ? [Number(agencyId)] : []), ...(safeInt(clientId) ? [Number(clientId)] : [])]);
  return note ? (await getApprovedClinicalContext({ note })).note : null;
}

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
  diagnosisCodes = null,
  approvedNote = null
}) {
  const versionedNote = approvedNote || await approvedNoteById(clinicalNoteId, agencyId, clientId);
  if (versionedNote?.clinical_version_id) {
    const metadata = typeof versionedNote.metadata_json === 'string' ? JSON.parse(versionedNote.metadata_json) : versionedNote.metadata_json || {};
    if (metadata.source === 'h0002_digital_screening' || (metadata.serviceCode || versionedNote.clinical_version_encounter_context?.serviceCode) === 'H0002') return ['R69'];
    const recordedCodes = metadata.diagnosisCodes || metadata.diagnosis_codes;
    if (Array.isArray(recordedCodes) && recordedCodes.length) return recordedCodes.map(code => String(code).trim().toUpperCase()).filter(Boolean);
    if (versionedNote.primary_diagnosis_id) {
      const [[diagnosis]] = await clinicalPool.execute('SELECT icd10_code FROM clinical_diagnoses WHERE id = ? AND agency_id = ? AND client_id = ? LIMIT 1', [versionedNote.primary_diagnosis_id, agencyId, clientId]);
      if (diagnosis?.icd10_code) return [String(diagnosis.icd10_code).trim().toUpperCase()];
    }
    // A caller override cannot replace diagnosis evidence signed in a version.
    diagnosisCodes = null;
  }
  if (safeInt(clinicalNoteId)) {
    const [[screening]] = await clinicalPool.execute(`SELECT n.metadata_json FROM clinical_notes n JOIN clinical_sessions s ON s.id=n.clinical_session_id
      WHERE n.id=? AND n.agency_id=? AND n.client_id=? AND n.is_deleted=0 AND s.service_code='H0002'
        AND JSON_UNQUOTE(JSON_EXTRACT(s.metadata_json,'$.source'))='h0002_digital_screening'`, [Number(clinicalNoteId),Number(agencyId),Number(clientId)]);
    const meta = typeof screening?.metadata_json === 'string' ? JSON.parse(screening.metadata_json) : screening?.metadata_json;
    if (meta?.source === 'h0002_digital_screening') return ['R69'];
  }
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
  dateOfService = null,
  approvedNote = null
}) {
  const versionedNote = approvedNote || await approvedNoteById(clinicalNoteId);
  if (versionedNote?.clinical_version_id) {
    const metadata = typeof versionedNote.metadata_json === 'string' ? JSON.parse(versionedNote.metadata_json) : versionedNote.metadata_json || {};
    return isoDate(metadata.dateOfService || metadata.date_of_service || versionedNote.clinical_version_encounter_context?.dateOfService);
  }
  // A digital screening is rendered when its clinician completes the review.
  // Neither a caller override nor the draft's creation date can establish DOS.
  const sessionId = safeInt(clinicalSessionId);
  let session;
  if (sessionId) {
    const [rows] = await clinicalPool.execute(
      'SELECT scheduled_start_at, source_timezone, created_at, metadata_json FROM clinical_sessions WHERE id = ? LIMIT 1', [sessionId]
    );
    session = rows?.[0];
    const metadata = typeof session?.metadata_json === 'string' ? JSON.parse(session.metadata_json) : session?.metadata_json;
    if (metadata?.source === 'h0002_digital_screening') return isoDate(metadata.serviceDate);
  }
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

  if (sessionId) {
    const metadata = typeof session?.metadata_json === 'string' ? JSON.parse(session.metadata_json) : session?.metadata_json;
    const importedDate = isoDate(metadata?.serviceDate);
    if (importedDate) return importedDate;
    const raw = session?.scheduled_start_at || session?.created_at;
    const instant = raw instanceof Date ? raw : new Date(String(raw || '').replace(' ', 'T').replace(/Z?$/, 'Z'));
    const fromSession = utcDateToZonedYmd(instant, session?.source_timezone || 'America/Denver');
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

  const [sessions] = await clinicalPool.execute(
    `SELECT id, encounter_status, claim_blocked_reason, provider_user_id, service_code FROM clinical_sessions WHERE id = ? AND agency_id = ? AND client_id = ? LIMIT 1`,
    [sessionId, agency, client]
  );
  checks.hasSession = !!sessions?.[0];
  if (!checks.hasSession) {
    return { ready: false, checks, blockers: ['Session does not belong to this client and agency'], warnings, diagnosisCodes: [], noteId: null, planId: null };
  }
  if (['no_show', 'cancelled', 'canceled', 'voided', 'rescheduled'].includes(sessions[0].encounter_status)) {
    blockers.push('Appointment did not occur; insurance claims are blocked');
  }
  if (sessions[0].claim_blocked_reason) blockers.push(sessions[0].claim_blocked_reason);

  let noteId = safeInt(clinicalNoteId);
  let note = null;
  const selectNoteFull = `SELECT id, agency_id, client_id, clinical_session_id, provider_signed_at, supervisor_cosigned_at, is_billable,
              primary_diagnosis_id, metadata_json, created_at
       FROM clinical_notes`;
  const selectNoteLegacy = `SELECT id, agency_id, client_id, clinical_session_id, provider_signed_at, supervisor_cosigned_at, is_billable,
                  metadata_json, created_at
           FROM clinical_notes`;

  async function loadNoteById(id) {
    try {
      const [rows] = await clinicalPool.execute(`${selectNoteFull} WHERE id = ? AND clinical_session_id = ? AND agency_id = ? AND client_id = ? AND is_deleted = 0 LIMIT 1`, [id, sessionId, agency, client]);
      return rows?.[0] || null;
    } catch (e) {
      if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
      const [rows] = await clinicalPool.execute(`${selectNoteLegacy} WHERE id = ? AND clinical_session_id = ? AND agency_id = ? AND client_id = ? AND is_deleted = 0 LIMIT 1`, [id, sessionId, agency, client]);
      return rows?.[0] || null;
    }
  }

  async function loadLatestNoteForSession(sid) {
    try {
      const [rows] = await clinicalPool.execute(
        `${selectNoteFull}
         WHERE clinical_session_id = ? AND agency_id = ? AND client_id = ? AND is_deleted = 0
         ORDER BY COALESCE(provider_signed_at, created_at) DESC, id DESC
         LIMIT 1`,
        [sid, agency, client]
      );
      return rows?.[0] || null;
    } catch (e) {
      if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
      const [rows] = await clinicalPool.execute(
        `${selectNoteLegacy}
           WHERE clinical_session_id = ? AND agency_id = ? AND client_id = ? AND is_deleted = 0
           ORDER BY COALESCE(provider_signed_at, created_at) DESC, id DESC
           LIMIT 1`,
        [sid, agency, client]
      );
      return rows?.[0] || null;
    }
  }

  if (noteId) {
    note = await loadNoteById(noteId);
  }
  if (noteId && !note) {
    blockers.push('Selected note does not belong to this session or was deleted');
    noteId = null;
  } else if (!note) {
    note = await loadLatestNoteForSession(sessionId);
    noteId = note?.id || null;
  }

  checks.hasNote = !!noteId;
  if (!noteId) blockers.push('No clinical note on this session');
  let clinicalVersion = null;
  if (note) {
    note = (await getApprovedClinicalContext({ note })).note;
    const state = await clinicalVersionBillingState({ noteId, agencyId: agency });
    blockers.push(...state.blockers);
    const metadata = typeof note.metadata_json === 'string' ? JSON.parse(note.metadata_json) : note.metadata_json || {};
    if ((metadata.serviceDetailAmendments || []).some(amendment => !amendment.approvedAt && !amendment.supersededByAmendmentId && !amendment.supersededByRevisionId)) {
      blockers.push('A legacy service correction awaits approval in an amended clinical version. Claim transmission is paused.');
    }
    clinicalVersion = { revisionId: state.effectiveRevisionId, contentHash: state.effectiveRevision?.contentHash || null, pendingRevisionId: state.pendingRevisionId };
    checks.noteSigned = !!note.provider_signed_at;
    checks.noteBillable = Number(note.is_billable) === 1;
    if (requireSignedNote && note.provider_signed_at && !checks.noteBillable) {
      blockers.push('Note requires supervisor approval or is non-billable');
    }
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
    clinicalNoteId: noteId,
    approvedNote: note
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
    clinicalNoteId: noteId,
    approvedNote: note
  });

  const approvedMetadata = typeof note?.metadata_json === 'string' ? JSON.parse(note.metadata_json) : note?.metadata_json || {};
  const diagnosisPolicy = await evaluateClientDiagnosisPolicy({agencyId:agency,clientId:client,providerUserId:note?.provider_signed_by_user_id || note?.created_by_user_id || sessions[0]?.provider_user_id,serviceCode:note?.clinical_version_encounter_context?.serviceCode || approvedMetadata.serviceCode || sessions[0]?.service_code,dateOfService:checks.dateOfService,diagnosisCodes,note});
  blockers.push(...diagnosisPolicy.blockers);
  warnings.push(...diagnosisPolicy.warnings);
  checks.diagnosisPolicy = diagnosisPolicy.ready;
  const ready = blockers.length === 0;
  return {
    ready,
    checks,
    blockers,
    warnings,
    diagnosisCodes,
    noteId,
    clinicalVersion,
    planId,
    diagnosisAlerts: diagnosisPolicy.alerts,
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
