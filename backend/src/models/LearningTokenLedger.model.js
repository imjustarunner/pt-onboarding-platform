import pool from '../config/database.js';

class LearningTokenLedger {
  static async addEntry({
    agencyId,
    clientId,
    guardianUserId = null,
    subscriptionId = null,
    learningProgramSessionId = null,
    tokenType = 'INDIVIDUAL',
    direction,
    quantity,
    reasonCode,
    effectiveAt = null,
    expiresAt = null,
    metadataJson = null,
    createdByUserId = null
  }) {
    const qty = Number(quantity || 0);
    const [result] = await pool.execute(
      `INSERT INTO learning_token_ledgers
         (agency_id, client_id, guardian_user_id, subscription_id, learning_program_session_id, token_type, direction,
          quantity, reason_code, effective_at, expires_at, metadata_json, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?, ?)`,
      [
        agencyId,
        clientId,
        guardianUserId,
        subscriptionId,
        learningProgramSessionId,
        tokenType,
        direction,
        qty,
        reasonCode,
        effectiveAt,
        expiresAt,
        metadataJson ? JSON.stringify(metadataJson) : null,
        createdByUserId
      ]
    );
    return result.insertId;
  }

  static async getBalanceByClient({ agencyId, clientId }) {
    const aid = Number(agencyId || 0);
    const cid = Number(clientId || 0);
    if (!aid || !cid) return { individualTokens: 0, groupTokens: 0 };
    const [rows] = await pool.execute(
      `SELECT
         token_type,
         SUM(CASE WHEN direction = 'CREDIT' THEN quantity ELSE -quantity END) AS balance
       FROM learning_token_ledgers
       WHERE agency_id = ?
         AND client_id = ?
       GROUP BY token_type`,
      [aid, cid]
    );
    let individualTokens = 0;
    let groupTokens = 0;
    for (const r of rows || []) {
      const t = String(r.token_type || '').toUpperCase();
      const bal = Number(r.balance || 0);
      if (t === 'GROUP') groupTokens = bal;
      else individualTokens = bal;
    }
    return { individualTokens, groupTokens };
  }

  static async hasSessionDebit({ agencyId, clientId, learningProgramSessionId, tokenType = 'INDIVIDUAL' }) {
    const aid = Number(agencyId || 0);
    const cid = Number(clientId || 0);
    const sid = Number(learningProgramSessionId || 0);
    if (!aid || !cid || !sid) return false;
    const [rows] = await pool.execute(
      `SELECT id
       FROM learning_token_ledgers
       WHERE agency_id = ?
         AND client_id = ?
         AND learning_program_session_id = ?
         AND direction = 'DEBIT'
         AND token_type = ?
       LIMIT 1`,
      [aid, cid, sid, String(tokenType || 'INDIVIDUAL').toUpperCase()]
    );
    return Boolean(rows?.[0]);
  }

  static async listForClient({ agencyId, clientId, limit = 200 }) {
    const aid = Number(agencyId || 0);
    const cid = Number(clientId || 0);
    if (!aid || !cid) return [];
    const lim = Math.min(Math.max(Number(limit || 200), 1), 500);
    const [rows] = await pool.execute(
      `SELECT id, token_type, direction, quantity, reason_code, effective_at, expires_at, metadata_json, created_at
       FROM learning_token_ledgers
       WHERE agency_id = ?
         AND client_id = ?
       ORDER BY effective_at DESC, id DESC
       LIMIT ${lim}`,
      [aid, cid]
    );
    return rows || [];
  }
}

export default LearningTokenLedger;
