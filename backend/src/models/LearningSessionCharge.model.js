import pool from '../config/database.js';

class LearningSessionCharge {
  static async create({
    agencyId,
    learningProgramSessionId,
    clientId,
    guardianUserId = null,
    amountCents = 0,
    taxCents = 0,
    discountCents = 0,
    currency = 'USD',
    chargeType = 'SESSION_FEE',
    chargeStatus = 'PENDING',
    dueAt = null,
    idempotencyKey = null,
    metadataJson = null,
    createdByUserId = null
  }) {
    const amount = Number(amountCents || 0);
    const tax = Number(taxCents || 0);
    const discount = Number(discountCents || 0);
    const total = amount + tax - discount;
    const [result] = await pool.execute(
      `INSERT INTO learning_session_charges
         (agency_id, learning_program_session_id, client_id, guardian_user_id, amount_cents, tax_cents, discount_cents, total_cents,
          currency, charge_status, charge_type, due_at, idempotency_key, metadata_json, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        learningProgramSessionId,
        clientId,
        guardianUserId,
        amount,
        tax,
        discount,
        total,
        currency,
        chargeStatus,
        chargeType,
        dueAt,
        idempotencyKey,
        metadataJson ? JSON.stringify(metadataJson) : null,
        createdByUserId
      ]
    );
    return await this.findById(result.insertId);
  }

  static async findById(id) {
    const cid = Number(id || 0);
    if (!cid) return null;
    const [rows] = await pool.execute(`SELECT * FROM learning_session_charges WHERE id = ? LIMIT 1`, [cid]);
    return rows?.[0] || null;
  }

  static async findLatestForSession(learningProgramSessionId) {
    const sid = Number(learningProgramSessionId || 0);
    if (!sid) return null;
    const [rows] = await pool.execute(
      `SELECT *
       FROM learning_session_charges
       WHERE learning_program_session_id = ?
       ORDER BY id DESC
       LIMIT 1`,
      [sid]
    );
    return rows?.[0] || null;
  }

  static async listLedgerForClient({ agencyId, clientId, limit = 200 }) {
    const aid = Number(agencyId || 0);
    const cid = Number(clientId || 0);
    if (!aid || !cid) return [];
    const lim = Math.min(Math.max(Number(limit || 200), 1), 500);
    const [rows] = await pool.execute(
      `SELECT c.*,
              s.scheduled_start_at,
              s.scheduled_end_at,
              s.session_status,
              s.office_event_id
       FROM learning_session_charges c
       LEFT JOIN learning_program_sessions s ON s.id = c.learning_program_session_id
       WHERE c.agency_id = ?
         AND c.client_id = ?
       ORDER BY c.created_at DESC
       LIMIT ${lim}`,
      [aid, cid]
    );
    return rows || [];
  }

  static async markCoveredByMode({ chargeId, mode, metadataPatch = {} }) {
    const cid = Number(chargeId || 0);
    if (!cid) return null;
    const charge = await this.findById(cid);
    if (!charge) return null;
    let metadata = {};
    try {
      metadata = typeof charge.metadata_json === 'string'
        ? (JSON.parse(charge.metadata_json || '{}') || {})
        : (charge.metadata_json || {});
    } catch {
      metadata = {};
    }
    metadata.coverageMode = String(mode || '').toUpperCase();
    metadata.coveredAt = new Date().toISOString();
    metadata = { ...metadata, ...(metadataPatch || {}) };
    await pool.execute(
      `UPDATE learning_session_charges
       SET charge_status = 'CAPTURED',
           discount_cents = amount_cents,
           total_cents = 0,
           captured_at = CURRENT_TIMESTAMP,
           metadata_json = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [JSON.stringify(metadata), cid]
    );
    return await this.findById(cid);
  }
}

export default LearningSessionCharge;
