import pool from '../config/database.js';

function normEmail(v) {
  const e = String(v || '').trim().toLowerCase();
  return e.includes('@') ? e : null;
}

class UserCommunicationContact {
  static async listForOwner(ownerUserId, { agencyId = null, trustStatus = null } = {}) {
    const params = [ownerUserId];
    let sql = `SELECT * FROM user_communication_contacts WHERE owner_user_id = ?`;
    if (agencyId) {
      sql += ` AND agency_id = ?`;
      params.push(agencyId);
    }
    if (trustStatus) {
      sql += ` AND trust_status = ?`;
      params.push(trustStatus);
    }
    sql += ` ORDER BY display_name ASC, email ASC, id ASC`;
    const [rows] = await pool.execute(sql, params);
    return rows || [];
  }

  static async findByEmail({ ownerUserId, agencyId, email }) {
    const e = normEmail(email);
    if (!ownerUserId || !agencyId || !e) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM user_communication_contacts
       WHERE owner_user_id = ? AND agency_id = ? AND email = ?
       LIMIT 1`,
      [ownerUserId, agencyId, e]
    );
    return rows?.[0] || null;
  }

  static async upsertSafe({
    agencyId,
    ownerUserId,
    email,
    phone = null,
    displayName = null,
    linkedUserId = null,
    linkedClientId = null,
    linkedEntityType = null,
    linkedEntityId = null,
    source = 'manual'
  }) {
    const e = normEmail(email);
    if (!agencyId || !ownerUserId || !e) throw new Error('agencyId, ownerUserId, and email are required');
    const existing = await this.findByEmail({ ownerUserId, agencyId, email: e });
    if (existing?.trust_status === 'blocked') {
      return existing;
    }
    await pool.execute(
      `INSERT INTO user_communication_contacts
        (agency_id, owner_user_id, email, phone, display_name, linked_user_id, linked_client_id,
         linked_entity_type, linked_entity_id, trust_status, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'safe', ?)
       ON DUPLICATE KEY UPDATE
         phone = COALESCE(VALUES(phone), phone),
         display_name = COALESCE(VALUES(display_name), display_name),
         linked_user_id = COALESCE(VALUES(linked_user_id), linked_user_id),
         linked_client_id = COALESCE(VALUES(linked_client_id), linked_client_id),
         linked_entity_type = COALESCE(VALUES(linked_entity_type), linked_entity_type),
         linked_entity_id = COALESCE(VALUES(linked_entity_id), linked_entity_id),
         trust_status = IF(trust_status = 'blocked', 'blocked', 'safe'),
         source = VALUES(source),
         updated_at = CURRENT_TIMESTAMP`,
      [
        agencyId,
        ownerUserId,
        e,
        phone || null,
        displayName || null,
        linkedUserId || null,
        linkedClientId || null,
        linkedEntityType || null,
        linkedEntityId || null,
        source || 'manual'
      ]
    );
    return this.findByEmail({ ownerUserId, agencyId, email: e });
  }

  static async block({
    agencyId,
    ownerUserId,
    email,
    reason,
    blockedByUserId,
    linkedUserId = null,
    displayName = null
  }) {
    const e = normEmail(email);
    const why = String(reason || '').trim();
    if (!agencyId || !ownerUserId || !e) throw new Error('agencyId, ownerUserId, and email are required');
    if (!why) throw new Error('Block reason is required');
    await pool.execute(
      `INSERT INTO user_communication_contacts
        (agency_id, owner_user_id, email, display_name, linked_user_id, trust_status, source,
         block_reason, blocked_at, blocked_by_user_id)
       VALUES (?, ?, ?, ?, ?, 'blocked', 'manual', ?, CURRENT_TIMESTAMP, ?)
       ON DUPLICATE KEY UPDATE
         trust_status = 'blocked',
         block_reason = VALUES(block_reason),
         blocked_at = CURRENT_TIMESTAMP,
         blocked_by_user_id = VALUES(blocked_by_user_id),
         linked_user_id = COALESCE(VALUES(linked_user_id), linked_user_id),
         display_name = COALESCE(VALUES(display_name), display_name),
         updated_at = CURRENT_TIMESTAMP`,
      [agencyId, ownerUserId, e, displayName || null, linkedUserId || null, why.slice(0, 500), blockedByUserId || ownerUserId]
    );
    return this.findByEmail({ ownerUserId, agencyId, email: e });
  }

  static async unblock({ ownerUserId, agencyId, email }) {
    const e = normEmail(email);
    if (!ownerUserId || !agencyId || !e) return null;
    await pool.execute(
      `UPDATE user_communication_contacts
       SET trust_status = 'safe',
           block_reason = NULL,
           blocked_at = NULL,
           blocked_by_user_id = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE owner_user_id = ? AND agency_id = ? AND email = ?`,
      [ownerUserId, agencyId, e]
    );
    return this.findByEmail({ ownerUserId, agencyId, email: e });
  }

  static async remove({ ownerUserId, agencyId, id }) {
    await pool.execute(
      `DELETE FROM user_communication_contacts
       WHERE id = ? AND owner_user_id = ? AND agency_id = ?`,
      [id, ownerUserId, agencyId]
    );
    return { ok: true };
  }

  static async isBlocked({ ownerUserId, agencyId, email }) {
    const row = await this.findByEmail({ ownerUserId, agencyId, email });
    return row?.trust_status === 'blocked' ? row : null;
  }
}

export default UserCommunicationContact;
