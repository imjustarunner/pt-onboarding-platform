import crypto from 'crypto';

function decodeKeyMaterialFromBase64(b64) {
  if (!b64) return null;
  try {
    let raw = String(b64).trim();
    if (
      (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) ||
      (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2)
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

let warnedFallbackSource = null;

/**
 * Pick the best-available encryption key for guardian intake profiles.
 *
 * Preference order:
 *   1. Dedicated guardian key (GUARDIAN_INTAKE or CONTACT_COMMS) — ideal.
 *   2. INTAKE_RESPONSES_ENCRYPTION_KEY_BASE64 — same domain (intake form
 *      data), so reusing it keeps the "Guardian (latest intake)" card on the
 *      Overview tab populated with zero extra .env config in environments
 *      that already provisioned intake-responses encryption.
 *   3. CLIENT_CHAT_ENCRYPTION_KEY_BASE64 — last-resort fallback so older
 *      deployments still render guardian info instead of silently failing.
 *
 * We log once per fallback source so operators can see which key is active.
 */
function getPrimaryKeyMaterial() {
  const dedicated = decodeKeyMaterialFromBase64(
    process.env.GUARDIAN_INTAKE_ENCRYPTION_KEY_BASE64
    || process.env.CONTACT_COMMS_ENCRYPTION_KEY_BASE64
  );
  if (dedicated) return dedicated;

  const intakeResponses = decodeKeyMaterialFromBase64(process.env.INTAKE_RESPONSES_ENCRYPTION_KEY_BASE64);
  if (intakeResponses) {
    if (warnedFallbackSource !== 'intake_responses') {
      warnedFallbackSource = 'intake_responses';
      console.warn(
        '[guardianIntakeEncryption] Using INTAKE_RESPONSES_ENCRYPTION_KEY_BASE64 as the guardian-intake key. '
        + 'This is a reasonable fallback (same data domain). Set GUARDIAN_INTAKE_ENCRYPTION_KEY_BASE64 '
        + 'if you want per-feature key separation.'
      );
    }
    return intakeResponses;
  }

  const chatFallback = decodeKeyMaterialFromBase64(process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64);
  if (chatFallback) {
    if (warnedFallbackSource !== 'client_chat') {
      warnedFallbackSource = 'client_chat';
      console.warn(
        '[guardianIntakeEncryption] Using CLIENT_CHAT_ENCRYPTION_KEY_BASE64 as a last-resort fallback. '
        + 'Configure GUARDIAN_INTAKE_ENCRYPTION_KEY_BASE64 or INTAKE_RESPONSES_ENCRYPTION_KEY_BASE64 '
        + 'for proper domain separation.'
      );
    }
    return chatFallback;
  }

  return null;
}

export function isGuardianIntakeEncryptionConfigured() {
  return !!getPrimaryKeyMaterial();
}

export function getGuardianIntakeEncryptionKeyId() {
  // Track which key ID is associated with whatever key getPrimaryKeyMaterial
  // ultimately used, so new rows can be decrypted later if operators rotate in
  // a dedicated key. Each ID defaults to 'v1' when not explicitly configured.
  if (process.env.GUARDIAN_INTAKE_ENCRYPTION_KEY_BASE64) {
    return process.env.GUARDIAN_INTAKE_ENCRYPTION_KEY_ID || 'v1';
  }
  if (process.env.CONTACT_COMMS_ENCRYPTION_KEY_BASE64) {
    return process.env.CONTACT_COMMS_ENCRYPTION_KEY_ID || 'v1';
  }
  if (process.env.INTAKE_RESPONSES_ENCRYPTION_KEY_BASE64) {
    return process.env.INTAKE_RESPONSES_ENCRYPTION_KEY_ID || 'v1';
  }
  if (process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64) {
    return process.env.CLIENT_CHAT_ENCRYPTION_KEY_ID || 'v1';
  }
  return 'v1';
}

export function encryptGuardianIntake(plaintext) {
  const key = getPrimaryKeyMaterial();
  if (!key) {
    throw new Error('Guardian intake encryption key not configured');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext || ''), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertextB64: ciphertext.toString('base64'),
    ivB64: iv.toString('base64'),
    authTagB64: tag.toString('base64'),
    keyId: getGuardianIntakeEncryptionKeyId()
  };
}

export function decryptGuardianIntake({ ciphertextB64, ivB64, authTagB64 }) {
  const key = getPrimaryKeyMaterial();
  if (!key) {
    throw new Error('Guardian intake encryption key not configured');
  }
  const iv = Buffer.from(String(ivB64 || ''), 'base64');
  const tag = Buffer.from(String(authTagB64 || ''), 'base64');
  const ciphertext = Buffer.from(String(ciphertextB64 || ''), 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

