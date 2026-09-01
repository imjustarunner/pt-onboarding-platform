import clinicalPool from '../config/clinicalDatabase.js';

function safeInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Upsert a clinical diagnosis for a client.
 * When setPrimary is true, demotes other primaries and marks this one primary.
 * When false, leaves existing primary flags alone (and inserts with is_primary=0).
 */
export async function upsertClinicalDiagnosis({
  agencyId,
  clientId,
  icd10Code,
  description = null,
  justification = null,
  createdByUserId,
  clinicalSessionId = null,
  clinicalNoteId = null,
  setPrimary = false,
  concernKind = 'clinical',
  /** When true, replace description/justification even when values are empty strings. */
  forceOverwrite = false
}) {
  const agency = safeInt(agencyId);
  const client = safeInt(clientId);
  const kind = String(concernKind || 'clinical').trim().toLowerCase() === 'learning_concern'
    ? 'learning_concern'
    : 'clinical';
  let code = String(icd10Code || '').trim().toUpperCase();
  const desc = description ? String(description).trim().slice(0, 500) : null;
  if (!code && kind === 'learning_concern' && desc) {
    const slug = desc.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 12);
    code = `LC-${slug || Date.now().toString(36).toUpperCase()}`.slice(0, 16);
  }
  const actor = safeInt(createdByUserId);
  if (!agency || !client || !code || !actor) {
    throw new Error('agencyId, clientId, icd10Code (or learning description), and createdByUserId are required');
  }

  const conn = await clinicalPool.getConnection();
  try {
    await conn.beginTransaction();

    if (setPrimary) {
      await conn.execute(
        `UPDATE clinical_diagnoses
         SET is_primary = 0
         WHERE agency_id = ? AND client_id = ? AND is_primary = 1 AND is_active = 1`,
        [agency, client]
      );
    }

    const [existing] = await conn.execute(
      `SELECT id FROM clinical_diagnoses
       WHERE agency_id = ? AND client_id = ? AND icd10_code = ? AND is_active = 1
       ORDER BY id DESC
       LIMIT 1`,
      [agency, client, code]
    );

    let diagnosisId = existing?.[0]?.id || null;
    const primaryFlag = setPrimary ? 1 : 0;
    const nextJust = justification != null && String(justification).trim() !== ''
      ? String(justification)
      : null;
    if (diagnosisId) {
      try {
        // forceOverwrite: plan import always wins justification over prior intake values.
        const justSql = forceOverwrite
          ? 'justification = ?'
          : 'justification = COALESCE(?, justification)';
        await conn.execute(
          `UPDATE clinical_diagnoses
           SET description = COALESCE(?, description),
               ${justSql},
               concern_kind = COALESCE(?, concern_kind),
               is_primary = CASE WHEN ? = 1 THEN 1 ELSE is_primary END,
               is_active = 1,
               clinical_session_id = COALESCE(?, clinical_session_id),
               clinical_note_id = COALESCE(?, clinical_note_id)
           WHERE id = ?`,
          [
            desc,
            forceOverwrite ? (nextJust || String(justification || '') || null) : nextJust,
            kind,
            primaryFlag,
            safeInt(clinicalSessionId),
            safeInt(clinicalNoteId),
            diagnosisId
          ]
        );
      } catch (e) {
        if (e.code === 'ER_BAD_FIELD_ERROR') {
          await conn.execute(
            `UPDATE clinical_diagnoses
             SET description = COALESCE(?, description),
                 is_primary = CASE WHEN ? = 1 THEN 1 ELSE is_primary END,
                 is_active = 1
             WHERE id = ?`,
            [desc, primaryFlag, diagnosisId]
          );
        } else {
          throw e;
        }
      }
    } else {
      try {
        const [result] = await conn.execute(
          `INSERT INTO clinical_diagnoses
           (agency_id, client_id, clinical_session_id, clinical_note_id, icd10_code, description,
            concern_kind, justification, is_primary, is_active, created_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
          [
            agency,
            client,
            safeInt(clinicalSessionId),
            safeInt(clinicalNoteId),
            code,
            desc,
            kind,
            justification ? String(justification) : null,
            primaryFlag,
            actor
          ]
        );
        diagnosisId = result.insertId;
      } catch (e) {
        if (e.code === 'ER_BAD_FIELD_ERROR') {
          const [result] = await conn.execute(
            `INSERT INTO clinical_diagnoses
             (agency_id, client_id, clinical_session_id, clinical_note_id, icd10_code, description,
              is_primary, is_active, created_by_user_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
            [
              agency,
              client,
              safeInt(clinicalSessionId),
              safeInt(clinicalNoteId),
              code,
              desc,
              primaryFlag,
              actor
            ]
          );
          diagnosisId = result.insertId;
        } else {
          throw e;
        }
      }
    }

    await conn.commit();
    return diagnosisId;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * Upsert a primary clinical diagnosis for a client (demotes other primaries).
 * Returns the diagnosis row id.
 */
export async function upsertPrimaryClinicalDiagnosis(args) {
  return upsertClinicalDiagnosis({ ...args, setPrimary: true });
}

export async function getPrimaryClinicalDiagnosis({ agencyId, clientId }) {
  const agency = safeInt(agencyId);
  const client = safeInt(clientId);
  if (!agency || !client) return null;
  try {
    const [rows] = await clinicalPool.execute(
      `SELECT * FROM clinical_diagnoses
       WHERE agency_id = ? AND client_id = ? AND is_active = 1
       ORDER BY is_primary DESC, created_at DESC
       LIMIT 1`,
      [agency, client]
    );
    return rows?.[0] || null;
  } catch {
    return null;
  }
}

export async function attachDiagnosisToTreatmentPlan({
  planId,
  primaryDiagnosisId,
  diagnosticJustification = null
}) {
  const pid = safeInt(planId);
  const did = safeInt(primaryDiagnosisId);
  if (!pid || !did) return false;
  try {
    await clinicalPool.execute(
      `UPDATE clinical_treatment_plans
       SET primary_diagnosis_id = ?,
           diagnostic_justification = ?
       WHERE id = ?`,
      [did, diagnosticJustification ? String(diagnosticJustification) : null, pid]
    );
    return true;
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR') return false;
    throw e;
  }
}

export async function attachDiagnosisToClinicalNote({
  noteId,
  primaryDiagnosisId,
  diagnosticJustification = null
}) {
  const nid = safeInt(noteId);
  const did = safeInt(primaryDiagnosisId);
  if (!nid || !did) return false;
  try {
    await clinicalPool.execute(
      `UPDATE clinical_notes
       SET primary_diagnosis_id = ?,
           diagnostic_justification = COALESCE(?, diagnostic_justification)
       WHERE id = ?`,
      [did, diagnosticJustification ? String(diagnosticJustification) : null, nid]
    );
    return true;
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR') return false;
    throw e;
  }
}

export default {
  upsertClinicalDiagnosis,
  upsertPrimaryClinicalDiagnosis,
  getPrimaryClinicalDiagnosis,
  attachDiagnosisToTreatmentPlan,
  attachDiagnosisToClinicalNote
};
