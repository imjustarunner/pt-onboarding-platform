import pool from '../config/database.js';
import { encryptContactComms, decryptContactComms } from '../services/contactCommsEncryption.service.js';

class ContactCommunicationLog {
  static async create(data) {
    const {
      contactId,
      channel,
      direction,
      body,
      externalRefId = null,
      metadata = null
    } = data;

    let bodyEncrypted = null;
    let encryptionIvB64 = null;
    let encryptionAuthTagB64 = null;
    let encryptionKeyId = null;

    if (body) {
      try {
        const enc = encryptContactComms(body);
        bodyEncrypted = enc.ciphertextB64;
        encryptionIvB64 = enc.ivB64;
        encryptionAuthTagB64 = enc.authTagB64;
        encryptionKeyId = enc.keyId;
      } catch (e) {
        // If encryption not configured, store plaintext (fallback for dev)
        bodyEncrypted = body;
      }
    }

    const [result] = await pool.execute(
      `INSERT INTO contact_communication_logs
       (contact_id, channel, direction, body_encrypted, encryption_iv_b64, encryption_auth_tag_b64, encryption_key_id, external_ref_id, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        contactId,
        channel,
        direction,
        bodyEncrypted,
        encryptionIvB64,
        encryptionAuthTagB64,
        encryptionKeyId,
        externalRefId,
        metadata ? JSON.stringify(metadata) : null
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM contact_communication_logs WHERE id = ? LIMIT 1',
      [id]
    );
    return rows[0] || null;
  }

  static async findByExternalRefId(externalRefId) {
    const [rows] = await pool.execute(
      'SELECT * FROM contact_communication_logs WHERE external_ref_id = ? LIMIT 1',
      [externalRefId]
    );
    return rows[0] || null;
  }

  static async listByContactId(contactId, { limit = 50, offset = 0 } = {}) {
    const [rows] = await pool.execute(
      `SELECT * FROM contact_communication_logs
       WHERE contact_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [contactId, limit, offset]
    );
    return rows;
  }

  static async countByContactId(contactId) {
    const [rows] = await pool.execute(
      'SELECT COUNT(*) AS total FROM contact_communication_logs WHERE contact_id = ?',
      [contactId]
    );
    return Number(rows[0]?.total || 0);
  }

  static decryptBody(row) {
    if (!row?.body_encrypted) return null;
    if (!row.encryption_iv_b64 || !row.encryption_auth_tag_b64) {
      return row.body_encrypted;
    }
    try {
      return decryptContactComms({
        ciphertextB64: row.body_encrypted,
        ivB64: row.encryption_iv_b64,
        authTagB64: row.encryption_auth_tag_b64
      });
    } catch {
      return '[Unable to decrypt]';
    }
  }
}

export default ContactCommunicationLog;
