import crypto from 'crypto';

function decodeKeyMaterialFromBase64(b64) {
  if (!b64) return null;
  try {
    let raw = String(b64).trim();
    // Cloud-configured secrets sometimes end up wrapped in quotes; tolerate that.
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

function parseKeyRingJson() {
  // Optional key ring for decryption / key rotation support.
  // Example:
  // CLIENT_CHAT_ENCRYPTION_KEYS_JSON='{"v1":"<oldb64>","v2":"<newb64>"}'
  const raw = process.env.CLIENT_CHAT_ENCRYPTION_KEYS_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return new Map(
      Object.entries(parsed)
        .filter(([k, v]) => typeof k === 'string' && typeof v === 'string' && v)
        .map(([k, v]) => [k, v])
    );
  } catch {
    return null;
  }
}

function getPrimaryKeyMaterial() {
  return decodeKeyMaterialFromBase64(process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64);
}

function getKeyMaterialById(keyId) {
  const ring = parseKeyRingJson();
  if (!ring) return null;
  const b64 = ring.get(String(keyId || ''));
  return decodeKeyMaterialFromBase64(b64);
}

function getAllCandidateKeyMaterials(preferredKeyId = null) {
  const candidates = [];

  // 1) If the ciphertext row stores a key id, try that key first (if present in key ring).
  if (preferredKeyId) {
    const byId = getKeyMaterialById(preferredKeyId);
    if (byId) candidates.push(byId);
  }

  // 2) Always try the primary key (most common case).
  const primary = getPrimaryKeyMaterial();
  if (primary) candidates.push(primary);

  // 3) Then try any remaining keys in the ring (helps recover if keyId wasn't stored/accurate).
  const ring = parseKeyRingJson();
  if (ring) {
    for (const [, b64] of ring.entries()) {
      const k = decodeKeyMaterialFromBase64(b64);
      if (!k) continue;
      // avoid duplicates (same bytes)
      if (candidates.some((c) => c.equals(k))) continue;
      candidates.push(k);
    }
  }

  return candidates;
}

export function isChatEncryptionConfigured() {
  // For encryption we require a primary key.
  return !!getPrimaryKeyMaterial();
}

export function getChatEncryptionKeyId() {
  return process.env.CLIENT_CHAT_ENCRYPTION_KEY_ID || 'v1';
}

export function encryptChatText(plaintext) {
  const key = getPrimaryKeyMaterial();
  if (!key) {
    throw new Error('Chat encryption key not configured (CLIENT_CHAT_ENCRYPTION_KEY_BASE64)');
  }
  const iv = crypto.randomBytes(12); // GCM recommended IV length
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext || ''), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertextB64: ciphertext.toString('base64'),
    ivB64: iv.toString('base64'),
    authTagB64: tag.toString('base64'),
    keyId: getChatEncryptionKeyId()
  };
}

// This marker is outside the ciphertext so legacy body text (including JSON)
// can never be mistaken for a message envelope. Both subject and body remain
// inside the authenticated encrypted payload; the marker contains no content.
const CHAT_CONTENT_PREFIX = 'awmsg1:';

export function encryptChatContent({ body, subject = null }) {
  const encrypted = encryptChatText(JSON.stringify({ version: 1, type: 'secure_message', body: String(body || ''), subject }));
  return { ...encrypted, ciphertextB64: `${CHAT_CONTENT_PREFIX}${encrypted.ciphertextB64}` };
}

function decryptRawChatText({ ciphertextB64, ivB64, authTagB64, keyId = null }) {
  const iv = Buffer.from(String(ivB64 || ''), 'base64');
  const tag = Buffer.from(String(authTagB64 || ''), 'base64');
  const ciphertext = Buffer.from(String(ciphertextB64 || ''), 'base64');

  const candidates = getAllCandidateKeyMaterials(keyId);
  if (!candidates.length) {
    throw new Error(
      'Chat encryption key not configured (CLIENT_CHAT_ENCRYPTION_KEY_BASE64 or CLIENT_CHAT_ENCRYPTION_KEYS_JSON)'
    );
  }

  let lastErr = null;
  for (const key of candidates) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      return plaintext.toString('utf8');
    } catch (e) {
      lastErr = e;
    }
  }

  // If none of the candidates could decrypt this ciphertext, surface the error.
  throw lastErr || new Error('Unable to decrypt chat text');
}

export function decryptChatContent(encrypted) {
  const ciphertext = String(encrypted?.ciphertextB64 || '');
  if (!ciphertext.startsWith(CHAT_CONTENT_PREFIX)) return { body: decryptRawChatText(encrypted) };
  const content = JSON.parse(decryptRawChatText({ ...encrypted, ciphertextB64: ciphertext.slice(CHAT_CONTENT_PREFIX.length) }));
  if (content?.version !== 1 || content.type !== 'secure_message' || typeof content.body !== 'string' ||
      !(content.subject === null || typeof content.subject === 'string')) throw new Error('Invalid encrypted message content');
  return { body: content.body, subject: content.subject };
}

// Existing previews and other encryption consumers continue to receive body
// text only. Secure message views explicitly request the structured content.
export function decryptChatText(encrypted) {
  return decryptChatContent(encrypted).body;
}

export function readChatMessageContent(row) {
  if (!row?.body_ciphertext) return { body: row?.body || '', subject: row?.subject || null };
  const content = decryptChatContent({ ciphertextB64: row.body_ciphertext, ivB64: row.body_iv,
    authTagB64: row.body_auth_tag, keyId: row.encryption_key_id || null });
  // Only legacy body-only ciphertext may use the old plaintext subject column.
  return { body: content.body, subject: Object.hasOwn(content, 'subject') ? content.subject : row.subject || null };
}

