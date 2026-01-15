import crypto from 'crypto';

function getKeyMaterial() {
  const b64 = process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64;
  if (!b64) return null;
  const buf = Buffer.from(b64, 'base64');
  if (buf.length !== 32) return null;
  return buf;
}

export function isChatEncryptionConfigured() {
  return !!getKeyMaterial();
}

export function getChatEncryptionKeyId() {
  return process.env.CLIENT_CHAT_ENCRYPTION_KEY_ID || 'v1';
}

export function encryptChatText(plaintext) {
  const key = getKeyMaterial();
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

export function decryptChatText({ ciphertextB64, ivB64, authTagB64 }) {
  const key = getKeyMaterial();
  if (!key) {
    throw new Error('Chat encryption key not configured (CLIENT_CHAT_ENCRYPTION_KEY_BASE64)');
  }
  const iv = Buffer.from(String(ivB64 || ''), 'base64');
  const tag = Buffer.from(String(authTagB64 || ''), 'base64');
  const ciphertext = Buffer.from(String(ciphertextB64 || ''), 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

