import pool from '../config/database.js';
import {
  prepareEncryptedTicketText,
  resolveTicketPlaintext
} from '../utils/supportTicketCrypto.js';

class SmsProfileAudit {
  static async create({
    agencyId = null,
    clientId = null,
    userId = null,
    direction,
    fromNumber = null,
    toNumber = null,
    numberId = null,
    numberPurpose = null,
    body = '',
    messageLogId = null,
    notificationSmsLogId = null,
    occurredAt = null
  }) {
    const dir = String(direction || '').toUpperCase() === 'OUTBOUND' ? 'OUTBOUND' : 'INBOUND';
    const enc = prepareEncryptedTicketText(body || '');
    // Prefer ciphertext-only; if encryption unavailable, store empty cipher fields
    // and keep a short redacted placeholder is avoided — require encrypt or skip.
    const ciphertext = enc.encrypted ? enc.ciphertext : null;
    const iv = enc.encrypted ? enc.iv : null;
    const authTag = enc.encrypted ? enc.authTag : null;
    const keyId = enc.encrypted ? enc.keyId : null;

    // When encryption is not configured, still record metadata with empty body
    // so the audit trail exists; body decrypt returns ''.
    const [result] = await pool.execute(
      `INSERT INTO sms_profile_audit
        (agency_id, client_id, user_id, direction, from_number, to_number, number_id, number_purpose,
         body_ciphertext, body_iv, body_auth_tag, encryption_key_id,
         message_log_id, notification_sms_log_id, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`,
      [
        agencyId,
        clientId,
        userId,
        dir,
        fromNumber,
        toNumber,
        numberId,
        numberPurpose,
        ciphertext,
        iv,
        authTag,
        keyId,
        messageLogId,
        notificationSmsLogId,
        occurredAt
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    if (!id) return null;
    const [rows] = await pool.execute('SELECT * FROM sms_profile_audit WHERE id = ? LIMIT 1', [id]);
    return rows[0] || null;
  }

  static decryptRow(row) {
    if (!row) return null;
    const body = resolveTicketPlaintext(row, {
      plainKey: '_unused_plain',
      cipherKey: 'body_ciphertext',
      ivKey: 'body_iv',
      tagKey: 'body_auth_tag',
      keyIdKey: 'encryption_key_id'
    });
    return {
      id: row.id,
      agencyId: row.agency_id,
      clientId: row.client_id,
      userId: row.user_id,
      direction: row.direction,
      fromNumber: row.from_number,
      toNumber: row.to_number,
      numberId: row.number_id,
      numberPurpose: row.number_purpose,
      body,
      messageLogId: row.message_log_id,
      notificationSmsLogId: row.notification_sms_log_id,
      occurredAt: row.occurred_at,
      createdAt: row.created_at
    };
  }

  static async listForClient(clientId, { limit = 100, offset = 0 } = {}) {
    const lim = Math.min(Math.max(Number(limit) || 100, 1), 200);
    const off = Math.max(Number(offset) || 0, 0);
    const [rows] = await pool.query(
      `SELECT * FROM sms_profile_audit
       WHERE client_id = ?
       ORDER BY occurred_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [clientId, lim, off]
    );
    return (rows || []).map((r) => this.decryptRow(r));
  }

  static async listForUser(userId, { clientId = null, limit = 100, offset = 0 } = {}) {
    const lim = Math.min(Math.max(Number(limit) || 100, 1), 200);
    const off = Math.max(Number(offset) || 0, 0);
    if (clientId) {
      const [rows] = await pool.query(
        `SELECT * FROM sms_profile_audit
         WHERE (user_id = ? OR client_id = ?)
           AND (client_id = ? OR client_id IS NULL)
         ORDER BY occurred_at DESC, id DESC
         LIMIT ? OFFSET ?`,
        [userId, clientId, clientId, lim, off]
      );
      return (rows || []).map((r) => this.decryptRow(r));
    }
    const [rows] = await pool.query(
      `SELECT * FROM sms_profile_audit
       WHERE user_id = ?
          OR client_id IN (
            SELECT client_id FROM client_guardians WHERE guardian_user_id = ?
          )
       ORDER BY occurred_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [userId, userId, lim, off]
    );
    return (rows || []).map((r) => this.decryptRow(r));
  }
}

export default SmsProfileAudit;
