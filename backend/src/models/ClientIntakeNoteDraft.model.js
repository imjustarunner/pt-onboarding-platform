import { intakeDraftDatabase, withIntakeDraftMutationLock } from '../services/intakeDraftMutationLock.service.js';

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
    providerUserId = null,
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
    const pid = providerUserId == null || providerUserId === '' ? null : safeInt(providerUserId);
    if (!aid || !cid) throw new Error('agencyId and clientId are required');
    // providerUserId may be null for packet-bootstrap drafts before assignment

    const svc = String(serviceCode || '').trim().toUpperCase();
    if (!VALID_SERVICE_CODES.has(svc)) throw new Error(`serviceCode must be one of: ${[...VALID_SERVICE_CODES].join(', ')}`);

    const tid = String(toolId || '').trim();
    if (!tid) throw new Error('toolId is required');

    const st = VALID_STATUSES.has(status) ? status : 'draft';

    const [result] = await intakeDraftDatabase().execute(
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

  static async findOpenForSubmission({ clientId, agencyId, intakeSubmissionId, serviceCode = null }) {
    const cid = safeInt(clientId);
    const aid = safeInt(agencyId);
    const sid = safeInt(intakeSubmissionId);
    const code = ['90791', 'H0031'].includes(String(serviceCode || '').toUpperCase())
      ? String(serviceCode).toUpperCase()
      : null;
    if (!cid || !aid) return null;
    const codeSql = code ? ' AND UPPER(TRIM(service_code)) = ?' : '';
    if (sid) {
      const params = [cid, aid, sid];
      if (code) params.push(code);
      const [rows] = await intakeDraftDatabase().execute(
        `SELECT * FROM client_intake_note_drafts
         WHERE client_id = ? AND agency_id = ? AND intake_submission_id = ?
           AND status != 'failed'${codeSql}
         ORDER BY created_at DESC
         LIMIT 1`,
        params
      );
      if (rows?.[0]) return rows[0];
    }
    const params = [cid, aid];
    if (code) params.push(code);
    const [rows] = await intakeDraftDatabase().execute(
      `SELECT * FROM client_intake_note_drafts
       WHERE client_id = ? AND agency_id = ?
         AND status IN ('draft', 'diagnosis_pending', 'ready')${codeSql}
       ORDER BY created_at DESC
       LIMIT 1`,
      params
    );
    return rows?.[0] || null;
  }

  static async listSummariesForClient({ clientId, agencyId, limit = 50 }) {
    const cid = safeInt(clientId);
    const aid = safeInt(agencyId);
    if (!cid || !aid) return [];
    const lim = Math.min(100, Math.max(1, Number(limit) || 50));
    const [rows] = await intakeDraftDatabase().execute(
      `SELECT id, status, service_code, tool_id, diagnosis_action, treatment_plan_id,
              created_at, updated_at, finalized_at, provider_user_id
       FROM client_intake_note_drafts
       WHERE client_id = ? AND agency_id = ? AND status != 'failed'
       ORDER BY COALESCE(finalized_at, created_at) DESC, created_at DESC
       LIMIT ${lim}`,
      [cid, aid]
    );
    return rows || [];
  }

  static async hasFinalizedForClient({ clientId, agencyId }) {
    const cid = safeInt(clientId);
    const aid = safeInt(agencyId);
    if (!cid || !aid) return false;
    const [rows] = await intakeDraftDatabase().execute(
      `SELECT id FROM client_intake_note_drafts
       WHERE client_id = ? AND agency_id = ? AND status = 'final'
       LIMIT 1`,
      [cid, aid]
    );
    return !!rows?.[0];
  }

  static async findById(id) {
    const iid = safeInt(id);
    if (!iid) return null;
    const [rows] = await intakeDraftDatabase().execute(
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
    const [rows] = await intakeDraftDatabase().execute(
      `SELECT * FROM client_intake_note_drafts
       WHERE id = ? AND client_id = ? AND agency_id = ?
       LIMIT 1`,
      [iid, cid, aid]
    );
    return rows?.[0] || null;
  }

  static async latestForClient({ clientId, agencyId, serviceCode = null }) {
    const cid = safeInt(clientId);
    const aid = safeInt(agencyId);
    const code = ['90791', 'H0031'].includes(String(serviceCode || '').toUpperCase())
      ? String(serviceCode).toUpperCase()
      : null;
    if (!cid || !aid) return null;
    const params = [cid, aid];
    let codeSql = '';
    if (code) {
      codeSql = ' AND UPPER(TRIM(service_code)) = ?';
      params.push(code);
    }
    const [rows] = await intakeDraftDatabase().execute(
      `SELECT * FROM client_intake_note_drafts
       WHERE client_id = ? AND agency_id = ?${codeSql}
       ORDER BY created_at DESC
       LIMIT 1`,
      params
    );
    return rows?.[0] || null;
  }

  static async updateStatus({ draftId, status, diagnosisAction = undefined, confirmedDxJson = undefined, treatmentPlanId = undefined, errorMessage = undefined, finalizedAt = undefined }) {
    return withIntakeDraftMutationLock(draftId, async () => {
      const iid = safeInt(draftId);
      if (!iid) throw new Error('Invalid draftId');

      const current = await this.findById(iid);
      if (current?.status === 'final' && (status !== 'final' || diagnosisAction !== undefined || confirmedDxJson !== undefined)) {
        throw Object.assign(new Error('Intake note is already finalized; reopen it explicitly before editing.'), { status: 409, code: 'intake_already_finalized' });
      }

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
      await intakeDraftDatabase().execute(
        `UPDATE client_intake_note_drafts SET ${sets.join(', ')} WHERE id = ?`,
        vals
      );
      return this.findById(iid);
    });
  }

  /** Reopen a finalized draft so one-time chart setup can be replaced/corrected. */
  static async reopenForReplace(draftId) {
    return withIntakeDraftMutationLock(draftId, async () => {
      const iid = safeInt(draftId);
      if (!iid) throw new Error('Invalid draftId');
      await intakeDraftDatabase().execute(
        `UPDATE client_intake_note_drafts
         SET status = 'ready',
             finalized_at = NULL,
             error_message = NULL
         WHERE id = ? AND status = 'final'`,
        [iid]
      );
      return this.findById(iid);
    });
  }
  static async updateContent({
    draftId,
    noteBodyEnc = undefined,
    noteSectionsJsonEnc = undefined,
    sessionContextEnc = undefined,
    suggestedDxJson = undefined,
    confirmedDxJson = undefined,
    status = undefined,
    scrubbedInputEnc = undefined,
    diagnosisAction = undefined
  }) {
    return withIntakeDraftMutationLock(draftId, async () => {
      const iid = safeInt(draftId);
      if (!iid) throw new Error('Invalid draftId');
      const current = await this.findById(iid);
      if (current?.status === 'final') {
        throw Object.assign(new Error('Intake note is already finalized; reopen it explicitly before editing.'), { status: 409, code: 'intake_already_finalized' });
      }
      const sets = [];
      const vals = [];
      if (noteBodyEnc !== undefined) {
        sets.push('note_body_enc = ?');
        vals.push(noteBodyEnc ?? '');
      }
      if (noteSectionsJsonEnc !== undefined) {
        sets.push('note_sections_json_enc = ?');
        vals.push(noteSectionsJsonEnc ?? null);
      }
      if (sessionContextEnc !== undefined) {
        sets.push('session_context_enc = ?');
        vals.push(sessionContextEnc ?? null);
      }
      if (suggestedDxJson !== undefined) {
        sets.push('suggested_dx_json = ?');
        vals.push(suggestedDxJson ?? null);
      }
      if (confirmedDxJson !== undefined) {
        sets.push('confirmed_dx_json = ?');
        vals.push(confirmedDxJson ?? null);
      }
      if (status !== undefined && VALID_STATUSES.has(status)) {
        sets.push('status = ?');
        vals.push(status);
      }
      if (scrubbedInputEnc !== undefined) {
        sets.push('scrubbed_input_enc = ?');
        vals.push(scrubbedInputEnc ?? '');
      }
      if (diagnosisAction !== undefined) {
        sets.push('diagnosis_action = ?');
        vals.push(VALID_DIAGNOSIS_ACTIONS.has(diagnosisAction) ? diagnosisAction : null);
      }
      if (!sets.length) return this.findById(iid);
      vals.push(iid);
      await intakeDraftDatabase().execute(
        `UPDATE client_intake_note_drafts SET ${sets.join(', ')} WHERE id = ?`,
        vals
      );
      return this.findById(iid);
    });
  }
}

export default ClientIntakeNoteDraft;
