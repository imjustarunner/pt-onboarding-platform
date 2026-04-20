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

let didWarnAboutFallbackKey = false;

function getPrimaryKeyMaterial() {
  // Dedicated guardian-intake key (preferred).
  const dedicated = decodeKeyMaterialFromBase64(
    process.env.GUARDIAN_INTAKE_ENCRYPTION_KEY_BASE64
    || process.env.CONTACT_COMMS_ENCRYPTION_KEY_BASE64
  );
  if (dedicated) return dedicated;

  // Last-resort fallback: reuse the already-provisioned chat encryption key so
  // the Overview tab's "Guardian (latest intake)" card actually gets populated
  // in environments that never configured a dedicated guardian key. Without
  // this fallback, `encryptGuardianIntake` throws inside `persistGuardianProfileForClient`
  // and the try/catch silently eats the failure — leaving every profile empty.
  // Production tenants should still configure GUARDIAN_INTAKE_ENCRYPTION_KEY_BASE64
  // for proper domain separation; this is a compatibility seam, not the goal state.
  const fallback = decodeKeyMaterialFromBase64(process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64);
  if (fallback) {
    if (!didWarnAboutFallbackKey) {
      didWarnAboutFallbackKey = true;
      console.warn(
        '[guardianIntakeEncryption] Using CLIENT_CHAT_ENCRYPTION_KEY_BASE64 as a fallback key. '
        + 'Configure GUARDIAN_INTAKE_ENCRYPTION_KEY_BASE64 (or CONTACT_COMMS_ENCRYPTION_KEY_BASE64) '
        + 'for proper domain separation. See backend/src/scripts/generateIntakeResponsesEncryptionKey.js.'
      );
    }
    return fallback;
  }

  return null;
}

export function isGuardianIntakeEncryptionConfigured() {
  return !!getPrimaryKeyMaterial();
}

export function getGuardianIntakeEncryptionKeyId() {
  return process.env.GUARDIAN_INTAKE_ENCRYPTION_KEY_ID
    || process.env.CONTACT_COMMS_ENCRYPTION_KEY_ID
    || (process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64 && process.env.CLIENT_CHAT_ENCRYPTION_KEY_ID)
    || 'v1';
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

