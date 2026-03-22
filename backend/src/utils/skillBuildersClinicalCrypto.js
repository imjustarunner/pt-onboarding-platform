import { encryptChatText, decryptChatText, isChatEncryptionConfigured } from '../services/chatEncryption.service.js';

export function encryptSbClinicalPayload(value) {
  if (value === null || value === undefined) return null;
  if (!isChatEncryptionConfigured()) return String(value);
  const { ciphertextB64, ivB64, authTagB64, keyId } = encryptChatText(String(value));
  return JSON.stringify({
    _enc: true,
    keyId,
    iv: ivB64,
    tag: authTagB64,
    ciphertext: ciphertextB64
  });
}

export function decryptSbClinicalPayload(value) {
  const raw = value === null || value === undefined ? '' : String(value);
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    if (parsed?._enc && parsed.ciphertext && parsed.iv && parsed.tag) {
      return decryptChatText({
        ciphertextB64: parsed.ciphertext,
        ivB64: parsed.iv,
        authTagB64: parsed.tag,
        keyId: parsed.keyId || null
      });
    }
  } catch {
    /* plain */
  }
  return raw;
}
