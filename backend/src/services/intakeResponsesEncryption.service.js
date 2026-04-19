import crypto from 'crypto';

/**
 * Column-level AES-256-GCM encryption for intake_submissions payload + signer PII.
 *
 * Wire format on the row:
 *   payload_encrypted     MEDIUMBLOB  (ciphertext bytes — base64-decoded)
 *   payload_iv_b64        VARCHAR(64) (12-byte GCM IV, base64)
 *   payload_auth_tag_b64  VARCHAR(64) (16-byte GCM tag, base64)
 *   payload_key_id        VARCHAR(50) (which key in the ring produced it)
 *
 * Plaintext envelope (UTF-8 JSON):
 *   {
 *     intakeData: <object|null>,        // formerly intake_submissions.intake_data
 *     signerName: <string|null>,        // formerly intake_submissions.signer_name
 *     signerInitials: <string|null>,
 *     signerEmail: <string|null>,
 *     signerPhone: <string|null>
 *   }
 */

const SENSITIVE_KEYS = Object.freeze([
  'intake_data',
  'signer_name',
  'signer_initials',
  'signer_email',
  'signer_phone'
]);

function decodeKeyMaterialFromBase64(b64) {
  if (!b64) return null;
  try {
    let raw = String(b64).trim();
    if (
      (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2)
      || (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2)
    ) {
      raw = raw.slice(1, -1).trim();
    }
    const buf = Buffer.from(raw, 'base64');
    if (buf.length !== 32) return null;
    return buf;
  } catch {
    return null;
  }
}

function parseKeyRingJson() {
  const raw = process.env.INTAKE_RESPONSES_ENCRYPTION_KEYS_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return new Map(
      Object.entries(parsed)
        .filter(([k, v]) => typeof k === 'string' && typeof v === 'string' && v)
    );
  } catch {
    return null;
  }
}

function getPrimaryKeyMaterial() {
  // Fall back to the existing guardian-intake key so a single secret can cover
  // both the guardian profile blob and the new submission payload.
  return decodeKeyMaterialFromBase64(
    process.env.INTAKE_RESPONSES_ENCRYPTION_KEY_BASE64
    || process.env.GUARDIAN_INTAKE_ENCRYPTION_KEY_BASE64
  );
}

function getKeyMaterialById(keyId) {
  const ring = parseKeyRingJson();
  if (!ring) return null;
  const b64 = ring.get(String(keyId || ''));
  return decodeKeyMaterialFromBase64(b64);
}

function getAllCandidateKeyMaterials(preferredKeyId = null) {
  const candidates = [];
  if (preferredKeyId) {
    const byId = getKeyMaterialById(preferredKeyId);
    if (byId) candidates.push(byId);
  }
  const primary = getPrimaryKeyMaterial();
  if (primary && !candidates.some((c) => c.equals(primary))) candidates.push(primary);
  const ring = parseKeyRingJson();
  if (ring) {
    for (const [, b64] of ring.entries()) {
      const k = decodeKeyMaterialFromBase64(b64);
      if (!k) continue;
      if (candidates.some((c) => c.equals(k))) continue;
      candidates.push(k);
    }
  }
  return candidates;
}

export function isIntakeResponsesEncryptionConfigured() {
  return !!getPrimaryKeyMaterial();
}

export function getIntakeResponsesEncryptionKeyId() {
  return process.env.INTAKE_RESPONSES_ENCRYPTION_KEY_ID
    || process.env.GUARDIAN_INTAKE_ENCRYPTION_KEY_ID
    || 'v1';
}

export function getIntakeResponsesSensitiveKeys() {
  return [...SENSITIVE_KEYS];
}

/**
 * Build the JSON envelope from raw column values (or model-input values).
 * Accepts either snake_case (DB column) or camelCase keys.
 */
export function buildIntakePayloadEnvelope(input = {}) {
  const intakeDataRaw = input.intake_data ?? input.intakeData ?? null;
  let intakeData = intakeDataRaw;
  if (typeof intakeDataRaw === 'string' && intakeDataRaw.length) {
    try { intakeData = JSON.parse(intakeDataRaw); } catch { intakeData = intakeDataRaw; }
  }
  return {
    intakeData: intakeData ?? null,
    signerName: input.signer_name ?? input.signerName ?? null,
    signerInitials: input.signer_initials ?? input.signerInitials ?? null,
    signerEmail: input.signer_email ?? input.signerEmail ?? null,
    signerPhone: input.signer_phone ?? input.signerPhone ?? null
  };
}

export function encryptIntakePayload(envelope) {
  const key = getPrimaryKeyMaterial();
  if (!key) {
    throw new Error(
      'Intake responses encryption key not configured (INTAKE_RESPONSES_ENCRYPTION_KEY_BASE64 or GUARDIAN_INTAKE_ENCRYPTION_KEY_BASE64)'
    );
  }
  const plaintext = Buffer.from(JSON.stringify(envelope ?? {}), 'utf8');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext, // raw Buffer for MEDIUMBLOB
    ivB64: iv.toString('base64'),
    authTagB64: tag.toString('base64'),
    keyId: getIntakeResponsesEncryptionKeyId()
  };
}

export function decryptIntakePayload({ ciphertext, ivB64, authTagB64, keyId = null }) {
  const iv = Buffer.from(String(ivB64 || ''), 'base64');
  const tag = Buffer.from(String(authTagB64 || ''), 'base64');
  const ctBuf = Buffer.isBuffer(ciphertext)
    ? ciphertext
    : Buffer.from(String(ciphertext || ''), 'base64');
  const candidates = getAllCandidateKeyMaterials(keyId);
  if (!candidates.length) {
    throw new Error(
      'Intake responses encryption key not configured (INTAKE_RESPONSES_ENCRYPTION_KEY_BASE64 or INTAKE_RESPONSES_ENCRYPTION_KEYS_JSON)'
    );
  }
  let lastErr = null;
  for (const key of candidates) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(ctBuf), decipher.final()]);
      return JSON.parse(plaintext.toString('utf8'));
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Unable to decrypt intake responses payload');
}

/**
 * In-place: if the row carries an encrypted payload, decrypt it and overwrite
 * the row's sensitive columns with the recovered plaintext. Plaintext column
 * values that are already populated (legacy rows) are left untouched.
 *
 * Safe to call on rows without the encrypted columns selected — it no-ops.
 * Safe to call when the key is not configured — it logs once and no-ops.
 */
let _missingKeyWarned = false;
export function decryptIntakeSubmissionRow(row) {
  if (!row || typeof row !== 'object') return row;
  const ct = row.payload_encrypted;
  const iv = row.payload_iv_b64;
  const tag = row.payload_auth_tag_b64;
  if (!ct || !iv || !tag) return row;
  if (!isIntakeResponsesEncryptionConfigured()) {
    if (!_missingKeyWarned) {
      _missingKeyWarned = true;
      console.warn(
        '[intakeResponsesEncryption] payload_encrypted present but no decryption key configured — '
        + 'intake_data and signer_* fields will appear blank.'
      );
    }
    return row;
  }
  try {
    const env = decryptIntakePayload({
      ciphertext: ct,
      ivB64: iv,
      authTagB64: tag,
      keyId: row.payload_key_id || null
    });
    if (env && typeof env === 'object') {
      // Only overwrite when the plaintext column is empty so an in-flight
      // partial backfill doesn't blank a legitimate plaintext value.
      if (row.intake_data == null) row.intake_data = env.intakeData ?? null;
      if (row.signer_name == null) row.signer_name = env.signerName ?? null;
      if (row.signer_initials == null) row.signer_initials = env.signerInitials ?? null;
      if (row.signer_email == null) row.signer_email = env.signerEmail ?? null;
      if (row.signer_phone == null) row.signer_phone = env.signerPhone ?? null;
    }
  } catch (e) {
    console.error('[intakeResponsesEncryption] decrypt failed for submission row', {
      submissionId: row.id || null,
      keyId: row.payload_key_id || null,
      message: e?.message || String(e)
    });
  }
  return row;
}

/** Convenience wrapper for arrays. */
export function decryptIntakeSubmissionRows(rows) {
  if (!Array.isArray(rows)) return rows;
  rows.forEach(decryptIntakeSubmissionRow);
  return rows;
}

/** SELECT fragment to include the encrypted columns in raw SQL queries. */
export const INTAKE_PAYLOAD_ENCRYPTED_COLUMNS_SQL =
  's.payload_encrypted, s.payload_iv_b64, s.payload_auth_tag_b64, s.payload_key_id';
