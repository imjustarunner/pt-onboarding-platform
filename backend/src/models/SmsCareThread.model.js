import pool from '../config/database.js';

/**
 * Per client + agency number care ownership for clinical SMS.
 */
class SmsCareThread {
  static async findByKey({ agencyId, clientId, numberId = null }) {
    if (!agencyId || !clientId) return null;
    const [rows] = await pool.execute(
      `SELECT *
       FROM sms_care_threads
       WHERE agency_id = ?
         AND client_id = ?
         AND ((? IS NULL AND number_id IS NULL) OR number_id = ?)
       LIMIT 1`,
      [agencyId, clientId, numberId, numberId]
    );
    return rows[0] || null;
  }

  static async upsert({
    agencyId,
    clientId,
    numberId = null,
    ownerUserId = null,
    careState = 'under_care',
    supportAccess = 'observe',
    supportTicketId = null,
    lastInboundAt = null,
    lastOutboundAt = null,
    metadata = null
  }) {
    if (!agencyId || !clientId) throw new Error('agencyId and clientId are required');
    const existing = await this.findByKey({ agencyId, clientId, numberId });
    if (existing) {
      await pool.execute(
        `UPDATE sms_care_threads
         SET owner_user_id = COALESCE(?, owner_user_id),
             care_state = COALESCE(?, care_state),
             support_access = COALESCE(?, support_access),
             support_ticket_id = COALESCE(?, support_ticket_id),
             last_inbound_at = COALESCE(?, last_inbound_at),
             last_outbound_at = COALESCE(?, last_outbound_at),
             metadata = COALESCE(?, metadata),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          ownerUserId,
          careState,
          supportAccess,
          supportTicketId,
          lastInboundAt,
          lastOutboundAt,
          metadata ? JSON.stringify(metadata) : null,
          existing.id
        ]
      );
      return this.findByKey({ agencyId, clientId, numberId });
    }

    const [result] = await pool.execute(
      `INSERT INTO sms_care_threads
       (agency_id, number_id, client_id, owner_user_id, care_state, support_access, support_ticket_id,
        last_inbound_at, last_outbound_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        numberId,
        clientId,
        ownerUserId,
        careState,
        supportAccess,
        supportTicketId,
        lastInboundAt,
        lastOutboundAt,
        metadata ? JSON.stringify(metadata) : null
      ]
    );
    const [rows] = await pool.execute('SELECT * FROM sms_care_threads WHERE id = ?', [result.insertId]);
    return rows[0] || null;
  }

  static async setEscalated({ agencyId, clientId, numberId = null, supportTicketId = null, metadata = null }) {
    return this.upsert({
      agencyId,
      clientId,
      numberId,
      careState: 'escalated',
      supportAccess: 'respond',
      supportTicketId,
      metadata
    });
  }

  static async listClientIdsForOwner(userId, { agencyId = null } = {}) {
    const params = [userId];
    let agencyClause = '';
    if (agencyId) {
      agencyClause = 'AND agency_id = ?';
      params.push(agencyId);
    }
    const [rows] = await pool.execute(
      `SELECT DISTINCT client_id
       FROM sms_care_threads
       WHERE owner_user_id = ?
         AND care_state IN ('under_care', 'observing', 'escalated')
         ${agencyClause}`,
      params
    );
    return (rows || []).map((r) => Number(r.client_id)).filter(Boolean);
  }

  /** Latest care thread for a client (optionally preferred number). */
  static async findForClient({ agencyId, clientId, numberId = null }) {
    if (!clientId) return null;
    const params = [clientId];
    let agencyClause = '';
    if (agencyId) {
      agencyClause = 'AND agency_id = ?';
      params.push(agencyId);
    }
    params.push(numberId);
    const [rows] = await pool.execute(
      `SELECT sct.*,
              u.first_name AS owner_first_name,
              u.last_name AS owner_last_name
       FROM sms_care_threads sct
       LEFT JOIN users u ON u.id = sct.owner_user_id
       WHERE sct.client_id = ?
         ${agencyClause}
       ORDER BY
         (sct.number_id IS NOT NULL AND sct.number_id = ?) DESC,
         sct.updated_at DESC
       LIMIT 1`,
      params
    );
    return rows[0] || null;
  }

  static async updateState(id, { careState = null, supportAccess = null, ownerUserId = undefined, supportTicketId = undefined } = {}) {
    if (!id) throw new Error('id is required');
    const sets = [];
    const params = [];
    if (careState != null) {
      sets.push('care_state = ?');
      params.push(careState);
    }
    if (supportAccess != null) {
      sets.push('support_access = ?');
      params.push(supportAccess);
    }
    if (ownerUserId !== undefined) {
      sets.push('owner_user_id = ?');
      params.push(ownerUserId);
    }
    if (supportTicketId !== undefined) {
      sets.push('support_ticket_id = ?');
      params.push(supportTicketId);
    }
    if (!sets.length) return this.findById(id);
    sets.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    await pool.execute(`UPDATE sms_care_threads SET ${sets.join(', ')} WHERE id = ?`, params);
    return this.findById(id);
  }

  static async findById(id) {
    if (!id) return null;
    const [rows] = await pool.execute(
      `SELECT sct.*,
              u.first_name AS owner_first_name,
              u.last_name AS owner_last_name
       FROM sms_care_threads sct
       LEFT JOIN users u ON u.id = sct.owner_user_id
       WHERE sct.id = ?
       LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }
}

export default SmsCareThread;
