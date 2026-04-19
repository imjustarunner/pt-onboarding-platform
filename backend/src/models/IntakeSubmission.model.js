import pool from '../config/database.js';
import {
  buildIntakePayloadEnvelope,
  decryptIntakeSubmissionRow,
  decryptIntakeSubmissionRows,
  encryptIntakePayload,
  getIntakeResponsesSensitiveKeys,
  isIntakeResponsesEncryptionConfigured
} from '../services/intakeResponsesEncryption.service.js';

const SENSITIVE_KEYS = getIntakeResponsesSensitiveKeys();

function hasAnySensitive(obj) {
  if (!obj || typeof obj !== 'object') return false;
  for (const k of SENSITIVE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) return true;
  }
  return false;
}

/**
 * Build the four encrypted-column values from a sensitive-field input bag.
 * Returns an object whose keys map directly to DB columns.
 */
function buildEncryptedColumns(sensitiveBag) {
  const envelope = buildIntakePayloadEnvelope(sensitiveBag || {});
  const enc = encryptIntakePayload(envelope);
  return {
    payload_encrypted: enc.ciphertext,
    payload_iv_b64: enc.ivB64,
    payload_auth_tag_b64: enc.authTagB64,
    payload_key_id: enc.keyId
  };
}

class IntakeSubmission {
  static async create(data) {
    const {
      intakeLinkId,
      status = 'started',
      signerName = null,
      signerInitials = null,
      signerEmail = null,
      signerPhone = null,
      intakeData = null,
      intakeDataHash = null,
      consentGivenAt = null,
      submittedAt = null,
      ipAddress = null,
      userAgent = null,
      clientId = null,
      guardianUserId = null,
      combinedPdfPath = null,
      combinedPdfHash = null,
      retentionExpiresAt = null,
      sessionToken = null
    } = data;

    let signerNameCol = signerName;
    let signerInitialsCol = signerInitials;
    let signerEmailCol = signerEmail;
    let signerPhoneCol = signerPhone;
    let intakeDataCol = intakeData ? JSON.stringify(intakeData) : null;
    let payloadEncrypted = null;
    let payloadIv = null;
    let payloadAuthTag = null;
    let payloadKeyId = null;

    if (isIntakeResponsesEncryptionConfigured()) {
      const enc = buildEncryptedColumns({
        intake_data: intakeData,
        signer_name: signerName,
        signer_initials: signerInitials,
        signer_email: signerEmail,
        signer_phone: signerPhone
      });
      payloadEncrypted = enc.payload_encrypted;
      payloadIv = enc.payload_iv_b64;
      payloadAuthTag = enc.payload_auth_tag_b64;
      payloadKeyId = enc.payload_key_id;
      // Do NOT also persist plaintext when encryption is on.
      signerNameCol = null;
      signerInitialsCol = null;
      signerEmailCol = null;
      signerPhoneCol = null;
      intakeDataCol = null;
    }

    const [result] = await pool.execute(
      `INSERT INTO intake_submissions
       (intake_link_id, status, signer_name, signer_initials, signer_email, signer_phone, intake_data,
        intake_data_hash, payload_encrypted, payload_iv_b64, payload_auth_tag_b64, payload_key_id,
        consent_given_at, submitted_at, ip_address, user_agent, client_id, guardian_user_id,
        combined_pdf_path, combined_pdf_hash, retention_expires_at, session_token)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        intakeLinkId,
        status,
        signerNameCol,
        signerInitialsCol,
        signerEmailCol,
        signerPhoneCol,
        intakeDataCol,
        intakeDataHash,
        payloadEncrypted,
        payloadIv,
        payloadAuthTag,
        payloadKeyId,
        consentGivenAt,
        submittedAt,
        ipAddress,
        userAgent,
        clientId,
        guardianUserId,
        combinedPdfPath,
        combinedPdfHash,
        retentionExpiresAt,
        sessionToken
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM intake_submissions WHERE id = ? LIMIT 1',
      [id]
    );
    return rows[0] ? decryptIntakeSubmissionRow(rows[0]) : null;
  }

  /**
   * Variant of findById that returns the row WITHOUT transparent decryption.
   * Used by the encryption-aware updateById path so we can re-encrypt by
   * working from the canonical encrypted blob (or, for legacy rows, from the
   * existing plaintext columns) without round-tripping through decrypt twice.
   */
  static async findByIdRaw(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM intake_submissions WHERE id = ? LIMIT 1',
      [id]
    );
    return rows[0] || null;
  }

  static async findBySessionToken(sessionToken) {
    const token = String(sessionToken || '').trim();
    if (!token) return null;
    const [rows] = await pool.execute(
      'SELECT * FROM intake_submissions WHERE session_token = ? LIMIT 1',
      [token]
    );
    return rows[0] ? decryptIntakeSubmissionRow(rows[0]) : null;
  }

  static async countStartsByLinkAndIp({ intakeLinkId, ipAddress, since }) {
    const linkId = Number(intakeLinkId || 0);
    const ip = String(ipAddress || '').trim();
    if (!linkId || !ip) return 0;
    const sinceDate = since instanceof Date ? since : new Date(since || 0);
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS c
       FROM intake_submissions
       WHERE intake_link_id = ?
         AND ip_address = ?
         AND created_at >= ?`,
      [linkId, ip, sinceDate]
    );
    return Number(rows?.[0]?.c || 0);
  }

  static async updateById(id, updates) {
    if (!id || !updates) return this.findById(id);

    let effectiveUpdates = { ...updates };

    if (isIntakeResponsesEncryptionConfigured() && hasAnySensitive(effectiveUpdates)) {
      // Re-encrypt: merge the incoming sensitive fields with whatever the row
      // already holds (whether encrypted or legacy plaintext) so partial
      // updates don't accidentally null other sensitive fields.
      const existingRaw = await this.findByIdRaw(id);
      const existingDecrypted = existingRaw ? decryptIntakeSubmissionRow({ ...existingRaw }) : null;

      const merged = {
        intake_data:
          'intake_data' in effectiveUpdates
            ? coerceIntakeDataInput(effectiveUpdates.intake_data)
            : (existingDecrypted?.intake_data ?? null),
        signer_name:
          'signer_name' in effectiveUpdates
            ? effectiveUpdates.signer_name
            : (existingDecrypted?.signer_name ?? null),
        signer_initials:
          'signer_initials' in effectiveUpdates
            ? effectiveUpdates.signer_initials
            : (existingDecrypted?.signer_initials ?? null),
        signer_email:
          'signer_email' in effectiveUpdates
            ? effectiveUpdates.signer_email
            : (existingDecrypted?.signer_email ?? null),
        signer_phone:
          'signer_phone' in effectiveUpdates
            ? effectiveUpdates.signer_phone
            : (existingDecrypted?.signer_phone ?? null)
      };

      const enc = buildEncryptedColumns(merged);

      // Strip sensitive plaintext keys, force them to NULL, swap in encrypted columns.
      for (const k of SENSITIVE_KEYS) delete effectiveUpdates[k];
      effectiveUpdates.signer_name = null;
      effectiveUpdates.signer_initials = null;
      effectiveUpdates.signer_email = null;
      effectiveUpdates.signer_phone = null;
      effectiveUpdates.intake_data = null;
      effectiveUpdates.payload_encrypted = enc.payload_encrypted;
      effectiveUpdates.payload_iv_b64 = enc.payload_iv_b64;
      effectiveUpdates.payload_auth_tag_b64 = enc.payload_auth_tag_b64;
      effectiveUpdates.payload_key_id = enc.payload_key_id;
    }

    const fields = [];
    const values = [];
    for (const [key, val] of Object.entries(effectiveUpdates)) {
      fields.push(`${key} = ?`);
      values.push(val);
    }
    if (!fields.length) return this.findById(id);
    values.push(id);
    await pool.execute(`UPDATE intake_submissions SET ${fields.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }

  static async listByLinkId(intakeLinkId) {
    const [rows] = await pool.execute(
      `SELECT * FROM intake_submissions
       WHERE intake_link_id = ?
       ORDER BY created_at DESC, id DESC`,
      [intakeLinkId]
    );
    return decryptIntakeSubmissionRows(rows);
  }

  static async listExpired({ limit = 200 } = {}) {
    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 200));
    const [rows] = await pool.query(
      `SELECT * FROM intake_submissions
       WHERE retention_expires_at IS NOT NULL
         AND retention_expires_at <= NOW()
       ORDER BY retention_expires_at ASC, id ASC
       LIMIT ${safeLimit}`
    );
    return decryptIntakeSubmissionRows(rows);
  }

  static async deleteById(id) {
    if (!id) return 0;
    const [result] = await pool.execute(
      'DELETE FROM intake_submissions WHERE id = ?',
      [id]
    );
    return Number(result?.affectedRows || 0);
  }
}

/**
 * `intake_data` column is JSON, but call sites pass either an object, a
 * pre-stringified JSON string, or null. Normalize to an object/null for the
 * encryption envelope so JSON-stringified blobs don't get double-encoded.
 */
function coerceIntakeDataInput(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try { return JSON.parse(trimmed); } catch { return trimmed; }
  }
  return value;
}

export default IntakeSubmission;
