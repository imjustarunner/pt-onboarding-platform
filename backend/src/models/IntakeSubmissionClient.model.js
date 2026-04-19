import pool from '../config/database.js';
import {
  decryptIntakePayload,
  encryptIntakePayload,
  isIntakeResponsesEncryptionConfigured
} from '../services/intakeResponsesEncryption.service.js';

const SENSITIVE_KEYS = ['full_name', 'contact_phone'];

function hasAnySensitive(obj) {
  if (!obj || typeof obj !== 'object') return false;
  for (const k of SENSITIVE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) return true;
  }
  return false;
}

function buildPiiEnvelope(input = {}) {
  return {
    fullName: input.full_name ?? input.fullName ?? null,
    contactPhone: input.contact_phone ?? input.contactPhone ?? null
  };
}

function buildEncryptedPiiColumns(sensitiveBag) {
  const enc = encryptIntakePayload(buildPiiEnvelope(sensitiveBag));
  return {
    pii_encrypted: enc.ciphertext,
    pii_iv_b64: enc.ivB64,
    pii_auth_tag_b64: enc.authTagB64,
    pii_key_id: enc.keyId
  };
}

let _missingKeyWarned = false;
export function decryptIntakeSubmissionClientRow(row) {
  if (!row || typeof row !== 'object') return row;
  const ct = row.pii_encrypted;
  const iv = row.pii_iv_b64;
  const tag = row.pii_auth_tag_b64;
  if (!ct || !iv || !tag) return row;
  if (!isIntakeResponsesEncryptionConfigured()) {
    if (!_missingKeyWarned) {
      _missingKeyWarned = true;
      console.warn(
        '[IntakeSubmissionClient] pii_encrypted present but no decryption key configured — '
        + 'full_name and contact_phone will appear blank.'
      );
    }
    return row;
  }
  try {
    const env = decryptIntakePayload({
      ciphertext: ct,
      ivB64: iv,
      authTagB64: tag,
      keyId: row.pii_key_id || null
    });
    if (env && typeof env === 'object') {
      if (row.full_name == null) row.full_name = env.fullName ?? null;
      if (row.contact_phone == null) row.contact_phone = env.contactPhone ?? null;
    }
  } catch (e) {
    console.error('[IntakeSubmissionClient] decrypt failed', {
      id: row.id || null,
      keyId: row.pii_key_id || null,
      message: e?.message || String(e)
    });
  }
  return row;
}

export function decryptIntakeSubmissionClientRows(rows) {
  if (!Array.isArray(rows)) return rows;
  rows.forEach(decryptIntakeSubmissionClientRow);
  return rows;
}

class IntakeSubmissionClient {
  static async create(data) {
    const { intakeSubmissionId, clientId = null, fullName = null, initials = null, contactPhone = null } = data;

    let fullNameCol = fullName;
    let contactPhoneCol = contactPhone;
    let piiEnc = null, piiIv = null, piiTag = null, piiKey = null;

    if (isIntakeResponsesEncryptionConfigured()) {
      const enc = buildEncryptedPiiColumns({ full_name: fullName, contact_phone: contactPhone });
      piiEnc = enc.pii_encrypted;
      piiIv = enc.pii_iv_b64;
      piiTag = enc.pii_auth_tag_b64;
      piiKey = enc.pii_key_id;
      fullNameCol = null;
      contactPhoneCol = null;
    }

    const [result] = await pool.execute(
      `INSERT INTO intake_submission_clients
       (intake_submission_id, client_id, full_name, initials, contact_phone,
        pii_encrypted, pii_iv_b64, pii_auth_tag_b64, pii_key_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [intakeSubmissionId, clientId, fullNameCol, initials, contactPhoneCol, piiEnc, piiIv, piiTag, piiKey]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM intake_submission_clients WHERE id = ? LIMIT 1',
      [id]
    );
    return rows[0] ? decryptIntakeSubmissionClientRow(rows[0]) : null;
  }

  static async findByIdRaw(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM intake_submission_clients WHERE id = ? LIMIT 1',
      [id]
    );
    return rows[0] || null;
  }

  static async listBySubmissionId(intakeSubmissionId) {
    const [rows] = await pool.execute(
      `SELECT * FROM intake_submission_clients
       WHERE intake_submission_id = ?
       ORDER BY id ASC`,
      [intakeSubmissionId]
    );
    return decryptIntakeSubmissionClientRows(rows);
  }

  static async updateById(id, updates) {
    if (!id || !updates) return this.findById(id);

    let effectiveUpdates = { ...updates };

    if (isIntakeResponsesEncryptionConfigured() && hasAnySensitive(effectiveUpdates)) {
      const existing = await this.findByIdRaw(id);
      const decrypted = existing ? decryptIntakeSubmissionClientRow({ ...existing }) : null;

      const merged = {
        full_name:
          'full_name' in effectiveUpdates
            ? effectiveUpdates.full_name
            : (decrypted?.full_name ?? null),
        contact_phone:
          'contact_phone' in effectiveUpdates
            ? effectiveUpdates.contact_phone
            : (decrypted?.contact_phone ?? null)
      };

      const enc = buildEncryptedPiiColumns(merged);
      for (const k of SENSITIVE_KEYS) delete effectiveUpdates[k];
      effectiveUpdates.full_name = null;
      effectiveUpdates.contact_phone = null;
      effectiveUpdates.pii_encrypted = enc.pii_encrypted;
      effectiveUpdates.pii_iv_b64 = enc.pii_iv_b64;
      effectiveUpdates.pii_auth_tag_b64 = enc.pii_auth_tag_b64;
      effectiveUpdates.pii_key_id = enc.pii_key_id;
    }

    const fields = [];
    const values = [];
    for (const [key, val] of Object.entries(effectiveUpdates)) {
      fields.push(`${key} = ?`);
      values.push(val);
    }
    if (!fields.length) return this.findById(id);
    values.push(id);
    await pool.execute(`UPDATE intake_submission_clients SET ${fields.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }
}

export default IntakeSubmissionClient;
