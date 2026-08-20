import pool from '../config/database.js';

function safeInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const VALID_ACTIONS = new Set(['remain', 'confirmed', 'updated']);

class ClientDiagnosisConfirmation {
  static async create({
    agencyId,
    clientId,
    draftId,
    action,
    suggestedDxJson,
    confirmedDxJson,
    comment = null,
    actorUserId
  }) {
    const aid = safeInt(agencyId);
    const cid = safeInt(clientId);
    const did = safeInt(draftId);
    const uid = safeInt(actorUserId);
    if (!aid || !cid || !did || !uid) {
      throw new Error('agencyId, clientId, draftId, actorUserId are required');
    }
    const act = VALID_ACTIONS.has(action) ? action : null;
    if (!act) throw new Error(`action must be one of: ${[...VALID_ACTIONS].join(', ')}`);

    const [result] = await pool.execute(
      `INSERT INTO client_diagnosis_confirmations
       (agency_id, client_id, draft_id, action, suggested_dx_json, confirmed_dx_json, comment, actor_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        aid, cid, did, act,
        String(suggestedDxJson || ''),
        String(confirmedDxJson || ''),
        comment ?? null,
        uid
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const iid = safeInt(id);
    if (!iid) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM client_diagnosis_confirmations WHERE id = ? LIMIT 1`,
      [iid]
    );
    return rows?.[0] || null;
  }

  static async listForDraft(draftId) {
    const did = safeInt(draftId);
    if (!did) return [];
    const [rows] = await pool.execute(
      `SELECT * FROM client_diagnosis_confirmations WHERE draft_id = ? ORDER BY created_at ASC`,
      [did]
    );
    return rows || [];
  }
}

export default ClientDiagnosisConfirmation;
