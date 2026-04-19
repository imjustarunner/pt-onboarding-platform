import crypto from 'crypto';
import pool from '../config/database.js';

class UserCommunication {
  /**
   * Generate a short URL-safe token used by the open-tracking pixel.
   * Hex (16 bytes -> 32 chars) keeps it well under VARCHAR(64) and avoids URL-encoding pitfalls.
   */
  static generateTrackingToken() {
    return crypto.randomBytes(16).toString('hex');
  }

  static async create(communicationData) {
    const {
      userId = null,
      clientId = null,
      agencyId,
      templateType,
      templateId,
      subject,
      body,
      generatedByUserId = null,
      channel = 'email',
      recipientAddress = null,
      deliveryStatus = 'pending',
      externalMessageId = null,
      sentAt = null,
      deliveredAt = null,
      errorMessage = null,
      metadata = null,
      trackingToken = null
    } = communicationData;

    const [result] = await pool.execute(
      `INSERT INTO user_communications
       (user_id, client_id, agency_id, template_type, template_id, channel, subject, body, recipient_address,
        delivery_status, external_message_id, sent_at, delivered_at, error_message, metadata, generated_by_user_id, tracking_token)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId || null,
        clientId || null,
        agencyId,
        templateType,
        templateId || null,
        channel,
        subject || null,
        body,
        recipientAddress || null,
        deliveryStatus,
        externalMessageId || null,
        sentAt || null,
        deliveredAt || null,
        errorMessage || null,
        metadata ? JSON.stringify(metadata) : null,
        generatedByUserId || null,
        trackingToken || null
      ]
    );

    return this.findById(result.insertId);
  }

  /**
   * Mark a row as opened by tracking token. Idempotent: only updates the FIRST open
   * (preserves the timestamp of the very first pixel hit). Returns the row id when
   * an update occurred, `null` when no matching row was found, and `false` when
   * the row was already opened (no-op).
   */
  static async markOpenedByToken(token) {
    const t = String(token || '').trim();
    if (!t) return null;
    const [rows] = await pool.execute(
      'SELECT id, opened_at FROM user_communications WHERE tracking_token = ? LIMIT 1',
      [t]
    );
    const row = rows?.[0];
    if (!row) return null;
    if (row.opened_at) return false;
    await pool.execute(
      'UPDATE user_communications SET opened_at = CURRENT_TIMESTAMP WHERE id = ? AND opened_at IS NULL',
      [row.id]
    );
    return row.id;
  }

  /**
   * Aggregate email rows that should appear on a client's Communications tab. Includes:
   *   * rows directly tagged with `client_id = :clientId`
   *   * rows whose `user_id` is one of this client's linked guardians (via `client_guardians`)
   * Results are returned newest-first with guardian display fields when available.
   */
  static async listForClient(clientId, { limit = 200 } = {}) {
    const cid = Number(clientId);
    if (!Number.isFinite(cid) || cid <= 0) return [];
    const lim = Math.min(Math.max(Number(limit) || 200, 1), 500);

    // Three match arms — the first two are the original matches, the third
    // catches "orphaned" historical rows that were sent to a known guardian
    // *email address* before that guardian's user account existed (or before
    // client_guardians was linked, or because the sender forgot to pass
    // client_id / user_id). Without this clause those rows would never appear
    // on the Communications tab even though they're clearly addressed to this
    // client's parent. Also includes a 4th arm that reaches sister-children
    // sharing an intake_submission so a packet email tagged to one child shows
    // for the other(s) too (multi-child intake parity).
    const [rows] = await pool.execute(
      `SELECT uc.id, uc.user_id, uc.client_id, uc.agency_id, uc.template_type, uc.template_id,
              uc.channel, uc.subject, uc.recipient_address, uc.delivery_status,
              uc.external_message_id, uc.sent_at, uc.delivered_at, uc.opened_at,
              uc.first_clicked_at, uc.error_message, uc.generated_at,
              u.id AS recipient_user_id,
              u.email AS recipient_email,
              u.first_name AS recipient_first_name,
              u.last_name AS recipient_last_name,
              u.role AS recipient_role,
              cg.relationship_title AS guardian_relationship,
              gb.first_name AS generated_by_first_name,
              gb.last_name AS generated_by_last_name,
              a.name AS agency_name
       FROM user_communications uc
       LEFT JOIN users u ON uc.user_id = u.id
       LEFT JOIN client_guardians cg
         ON cg.guardian_user_id = uc.user_id AND cg.client_id = ?
       LEFT JOIN users gb ON uc.generated_by_user_id = gb.id
       LEFT JOIN agencies a ON uc.agency_id = a.id
       WHERE uc.client_id = ?
          OR (uc.user_id IS NOT NULL AND uc.user_id IN (
               SELECT guardian_user_id FROM client_guardians WHERE client_id = ?
             ))
          OR (uc.recipient_address IS NOT NULL AND LOWER(uc.recipient_address) COLLATE utf8mb4_unicode_ci IN (
               SELECT LOWER(u2.email) COLLATE utf8mb4_unicode_ci
                 FROM client_guardians cg2
                 JOIN users u2 ON u2.id = cg2.guardian_user_id
                WHERE cg2.client_id = ? AND u2.email IS NOT NULL
             ))
          OR (uc.client_id IS NOT NULL AND uc.client_id IN (
               SELECT isc2.client_id
                 FROM intake_submission_clients isc2
                WHERE isc2.intake_submission_id IN (
                  SELECT isc3.intake_submission_id
                    FROM intake_submission_clients isc3
                   WHERE isc3.client_id = ?
                )
             ))
       ORDER BY COALESCE(uc.sent_at, uc.generated_at) DESC, uc.id DESC
       LIMIT ${lim}`,
      [cid, cid, cid, cid, cid]
    );
    return rows || [];
  }

  static async updateDeliveryStatus(id, status, externalMessageId = null, deliveredAt = null, errorMessage = null, metadata = null) {
    const updates = [];
    const values = [];

    updates.push('delivery_status = ?');
    values.push(status);

    if (externalMessageId !== null) {
      updates.push('external_message_id = ?');
      values.push(externalMessageId);
    }

    if (deliveredAt !== null) {
      updates.push('delivered_at = ?');
      values.push(deliveredAt);
    }

    if (errorMessage !== null) {
      updates.push('error_message = ?');
      values.push(errorMessage);
    }

    if (metadata !== null) {
      updates.push('metadata = ?');
      values.push(JSON.stringify(metadata));
    }

    // Set sent_at when status changes to 'sent' (if not already set)
    if (status === 'sent') {
      updates.push('sent_at = COALESCE(sent_at, CURRENT_TIMESTAMP)');
    }

    values.push(id);

    await pool.execute(
      `UPDATE user_communications SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    return this.findById(id);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT uc.*, 
              u.email as user_email, u.first_name as user_first_name, u.last_name as user_last_name,
              a.name as agency_name,
              gb.first_name as generated_by_first_name, gb.last_name as generated_by_last_name
       FROM user_communications uc
       LEFT JOIN users u ON uc.user_id = u.id
       LEFT JOIN agencies a ON uc.agency_id = a.id
       LEFT JOIN users gb ON uc.generated_by_user_id = gb.id
       WHERE uc.id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  static async findByUser(userId, filters = {}) {
    const { agencyId, templateType, limit, offset } = filters;

    // Includes client context (`client_id` + `client_initials`) so guardian profile views
    // can render a "Re: <client>" chip for messages sent on behalf of a specific client.
    let query = `SELECT uc.*,
                        a.name as agency_name,
                        gb.first_name as generated_by_first_name, gb.last_name as generated_by_last_name,
                        c.initials as client_initials
                 FROM user_communications uc
                 LEFT JOIN agencies a ON uc.agency_id = a.id
                 LEFT JOIN users gb ON uc.generated_by_user_id = gb.id
                 LEFT JOIN clients c ON uc.client_id = c.id
                 WHERE uc.user_id = ?`;
    const params = [userId];

    if (agencyId) {
      query += ' AND uc.agency_id = ?';
      params.push(agencyId);
    }

    if (templateType) {
      query += ' AND uc.template_type = ?';
      params.push(templateType);
    }

    query += ' ORDER BY uc.generated_at DESC';

    if (limit) {
      query += ' LIMIT ?';
      params.push(limit);
      if (offset) {
        query += ' OFFSET ?';
        params.push(offset);
      }
    }

    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async countByUser(userId, filters = {}) {
    const { agencyId, templateType } = filters;
    
    let query = 'SELECT COUNT(*) as count FROM user_communications WHERE user_id = ?';
    const params = [userId];

    if (agencyId) {
      query += ' AND agency_id = ?';
      params.push(agencyId);
    }

    if (templateType) {
      query += ' AND template_type = ?';
      params.push(templateType);
    }

    const [rows] = await pool.execute(query, params);
    return rows[0]?.count || 0;
  }
}

export default UserCommunication;
