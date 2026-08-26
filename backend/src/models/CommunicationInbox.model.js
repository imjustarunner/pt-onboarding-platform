import pool from '../config/database.js';

class CommunicationInbox {
  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT i.*, esi.signature_image_url, esi.signature_image_path, esi.reply_to, esi.display_name AS identity_display_name
       FROM communication_inboxes i
       LEFT JOIN email_sender_identities esi ON esi.id = i.sender_identity_id
       WHERE i.id = ?
       LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }

  static async listForAgency({ agencyId, userId = null, includeInactive = false } = {}) {
    const params = [];
    let where = '1=1';
    if (agencyId != null) {
      where += ' AND (i.agency_id = ? OR i.agency_id IS NULL)';
      params.push(agencyId);
    }
    if (!includeInactive) {
      where += ' AND i.is_active = 1';
    }
    // Personal inboxes: only owner / members. Shared: all (controller role-gates).
    if (userId) {
      where += ` AND (
        i.kind = 'shared'
        OR i.owner_user_id = ?
        OR EXISTS (
          SELECT 1 FROM communication_inbox_members m
          WHERE m.inbox_id = i.id AND m.user_id = ?
        )
      )`;
      params.push(userId, userId);
    } else {
      where += ` AND i.kind = 'shared'`;
    }
    const [rows] = await pool.execute(
      `SELECT i.*,
              esi.signature_image_url,
              esi.reply_to,
              (SELECT COUNT(*) FROM communication_inbox_members m WHERE m.inbox_id = i.id) AS member_count
       FROM communication_inboxes i
       LEFT JOIN email_sender_identities esi ON esi.id = i.sender_identity_id
       WHERE ${where}
       ORDER BY FIELD(i.kind, 'personal', 'shared'), i.display_name ASC`,
      params
    );
    return rows;
  }

  static async findPersonalForUser(agencyId, userId) {
    const [rows] = await pool.execute(
      `SELECT i.*, esi.signature_image_url, esi.reply_to
       FROM communication_inboxes i
       LEFT JOIN email_sender_identities esi ON esi.id = i.sender_identity_id
       WHERE i.agency_id = ? AND i.kind = 'personal' AND i.owner_user_id = ? AND i.is_active = 1
       LIMIT 1`,
      [agencyId, userId]
    );
    return rows[0] || null;
  }

  static async ensureFromSenderIdentities(agencyId) {
    if (!agencyId) return;
    await pool.execute(
      `INSERT INTO communication_inboxes (agency_id, sender_identity_id, kind, identity_key, display_name, from_email, is_active)
       SELECT
         esi.agency_id,
         esi.id,
         'shared',
         esi.identity_key,
         COALESCE(NULLIF(TRIM(esi.display_name), ''), esi.identity_key, esi.from_email),
         esi.from_email,
         1
       FROM email_sender_identities esi
       WHERE esi.is_active = 1 AND esi.agency_id = ?
       ON DUPLICATE KEY UPDATE
         sender_identity_id = VALUES(sender_identity_id),
         display_name = VALUES(display_name),
         from_email = VALUES(from_email),
         is_active = 1,
         updated_at = CURRENT_TIMESTAMP`,
      [agencyId]
    );
  }

  static async findBySenderIdentityId(senderIdentityId) {
    const [rows] = await pool.execute(
      `SELECT * FROM communication_inboxes WHERE sender_identity_id = ? LIMIT 1`,
      [senderIdentityId]
    );
    return rows[0] || null;
  }

  static async findByFromEmail(email, agencyId = null) {
    const addr = String(email || '').trim().toLowerCase();
    if (!addr) return null;
    const params = [addr];
    let sql = `SELECT * FROM communication_inboxes WHERE LOWER(from_email) = ? AND is_active = 1`;
    if (agencyId != null) {
      sql += ' AND agency_id = ?';
      params.push(agencyId);
    }
    sql += ' LIMIT 1';
    const [rows] = await pool.execute(sql, params);
    return rows[0] || null;
  }

  static async userHasAccess(inboxId, userId) {
    const inbox = await this.findById(inboxId);
    if (!inbox) return false;
    if (inbox.kind === 'shared') return true; // Phase 1: backoffice roles gate at controller
    const [rows] = await pool.execute(
      `SELECT 1 FROM communication_inbox_members WHERE inbox_id = ? AND user_id = ? LIMIT 1`,
      [inboxId, userId]
    );
    return !!rows[0];
  }
}

export default CommunicationInbox;
