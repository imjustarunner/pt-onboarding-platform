import clinicalPool from '../config/clinicalDatabase.js';

function safeInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Upsert a primary clinical diagnosis for a client (demotes other primaries).
 * Returns the diagnosis row id.
 */
export async function upsertPrimaryClinicalDiagnosis({
  agencyId,
  clientId,
  icd10Code,
  description = null,
  justification = null,
  createdByUserId,
  clinicalSessionId = null,
  clinicalNoteId = null
}) {
  const agency = safeInt(agencyId);
  const client = safeInt(clientId);
  const code = String(icd10Code || '').trim().toUpperCase();
  const actor = safeInt(createdByUserId);
  if (!agency || !client || !code || !actor) {
    throw new Error('agencyId, clientId, icd10Code, and createdByUserId are required');
  }

  const conn = await clinicalPool.getConnection();
  try {
    await conn.beginTransaction();

    // Demote existing primaries for this client
    await conn.execute(
      `UPDATE clinical_diagnoses
       SET is_primary = 0
       WHERE agency_id = ? AND client_id = ? AND is_primary = 1 AND is_active = 1`,
      [agency, client]
    );

    // Prefer reactivating / updating matching active code
    const [existing] = await conn.execute(
      `SELECT id FROM clinical_diagnoses
       WHERE agency_id = ? AND client_id = ? AND icd10_code = ? AND is_active = 1
       ORDER BY id DESC
       LIMIT 1`,
      [agency, client, code]
    );

    let diagnosisId = existing?.[0]?.id || null;
    if (diagnosisId) {
      try {
        await conn.execute(
          `UPDATE clinical_diagnoses
           SET description = COALESCE(?, description),
               justification = COALESCE(?, justification),
               is_primary = 1,
               is_active = 1,
               clinical_session_id = COALESCE(?, clinical_session_id),
               clinical_note_id = COALESCE(?, clinical_note_id)
           WHERE id = ?`,
          [
            description ? String(description).slice(0, 500) : null,
            justification ? String(justification) : null,
            safeInt(clinicalSessionId),
            safeInt(clinicalNoteId),
            diagnosisId
          ]
        );
      } catch (e) {
        // justification column may not exist yet
        if (e.code === 'ER_BAD_FIELD_ERROR') {
          await conn.execute(
            `UPDATE clinical_diagnoses
             SET description = COALESCE(?, description),
                 is_primary = 1,
                 is_active = 1
             WHERE id = ?`,
            [description ? String(description).slice(0, 500) : null, diagnosisId]
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
            justification, is_primary, is_active, created_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`,
          [
            agency,
            client,
            safeInt(clinicalSessionId),
            safeInt(clinicalNoteId),
            code,
            description ? String(description).slice(0, 500) : null,
            justification ? String(justification) : null,
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
             VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?)`,
            [
              agency,
              client,
              safeInt(clinicalSessionId),
              safeInt(clinicalNoteId),
              code,
              description ? String(description).slice(0, 500) : null,
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
           diagnostic_justification = COALESCE(?, diagnostic_justification)
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
  upsertPrimaryClinicalDiagnosis,
  getPrimaryClinicalDiagnosis,
  attachDiagnosisToTreatmentPlan,
  attachDiagnosisToClinicalNote
};
