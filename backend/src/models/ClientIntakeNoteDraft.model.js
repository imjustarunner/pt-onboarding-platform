import pool from '../config/database.js';

function safeInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const VALID_STATUSES = new Set(['draft', 'diagnosis_pending', 'ready', 'final', 'failed']);
const VALID_DIAGNOSIS_ACTIONS = new Set(['remain', 'confirmed', 'updated']);
const VALID_SERVICE_CODES = new Set(['90791', 'H0031']);

class ClientIntakeNoteDraft {
  static async create({
    agencyId,
    clientId,
    providerUserId,
    serviceCode,
    toolId,
    status = 'draft',
    scrubbedInputEnc,
    noteBodyEnc,
    noteSectionsJsonEnc = null,
    sessionContextEnc = null,
    suggestedDxJson = null,
    intakeSubmissionId = null
  }) {
    const aid = safeInt(agencyId);
    const cid = safeInt(clientId);
    const pid = safeInt(providerUserId);
    if (!aid || !cid || !pid) throw new Error('agencyId, clientId, providerUserId are required');

    const svc = String(serviceCode || '').trim().toUpperCase();
    if (!VALID_SERVICE_CODES.has(svc)) throw new Error(`serviceCode must be one of: ${[...VALID_SERVICE_CODES].join(', ')}`);

    const tid = String(toolId || '').trim();
    if (!tid) throw new Error('toolId is required');

    const st = VALID_STATUSES.has(status) ? status : 'draft';

    const [result] = await pool.execute(
      `INSERT INTO client_intake_note_drafts
       (agency_id, client_id, provider_user_id, service_code, tool_id, status,
        scrubbed_input_enc, note_body_enc, note_sections_json_enc, session_context_enc,
        suggested_dx_json, intake_submission_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        aid, cid, pid, svc, tid, st,
        String(scrubbedInputEnc || ''),
        String(noteBodyEnc || ''),
        noteSectionsJsonEnc ?? null,
        sessionContextEnc ?? null,
        suggestedDxJson ?? null,
        safeInt(intakeSubmissionId) ?? null
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const iid = safeInt(id);
    if (!iid) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM client_intake_note_drafts WHERE id = ? LIMIT 1`,
      [iid]
    );
    return rows?.[0] || null;
  }

  static async findForClient({ draftId, clientId, agencyId }) {
    const iid = safeInt(draftId);
    const cid = safeInt(clientId);
    const aid = safeInt(agencyId);
    if (!iid || !cid || !aid) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM client_intake_note_drafts
       WHERE id = ? AND client_id = ? AND agency_id = ?
       LIMIT 1`,
      [iid, cid, aid]
    );
    return rows?.[0] || null;
  }

  static async latestForClient({ clientId, agencyId }) {
    const cid = safeInt(clientId);
    const aid = safeInt(agencyId);
    if (!cid || !aid) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM client_intake_note_drafts
       WHERE client_id = ? AND agency_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [cid, aid]
    );
    return rows?.[0] || null;
  }

  static async updateStatus({ draftId, status, diagnosisAction = undefined, confirmedDxJson = undefined, treatmentPlanId = undefined, errorMessage = undefined, finalizedAt = undefined }) {
    const iid = safeInt(draftId);
    if (!iid) throw new Error('Invalid draftId');

    const sets = [];
    const vals = [];

    if (VALID_STATUSES.has(status)) {
      sets.push('status = ?');
      vals.push(status);
    }
    if (diagnosisAction !== undefined) {
      sets.push('diagnosis_action = ?');
      vals.push(VALID_DIAGNOSIS_ACTIONS.has(diagnosisAction) ? diagnosisAction : null);
    }
    if (confirmedDxJson !== undefined) {
      sets.push('confirmed_dx_json = ?');
      vals.push(confirmedDxJson ?? null);
    }
    if (treatmentPlanId !== undefined) {
      sets.push('treatment_plan_id = ?');
      vals.push(safeInt(treatmentPlanId) ?? null);
    }
    if (errorMessage !== undefined) {
      sets.push('error_message = ?');
      vals.push(errorMessage ?? null);
    }
    if (finalizedAt !== undefined) {
      sets.push('finalized_at = ?');
      vals.push(finalizedAt ?? null);
    }

    if (!sets.length) return this.findById(iid);

    vals.push(iid);
    await pool.execute(
      `UPDATE client_intake_note_drafts SET ${sets.join(', ')} WHERE id = ?`,
      vals
    );
    return this.findById(iid);
  }
}

export default ClientIntakeNoteDraft;
