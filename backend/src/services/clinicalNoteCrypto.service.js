import { encryptChatText, decryptChatText, isChatEncryptionConfigured } from './chatEncryption.service.js';

export function maybeEncryptNotePayload(value) {
  const plain = value == null ? '' : String(value);
  if (!plain) return plain;
  if (!isChatEncryptionConfigured()) return plain;
  try {
    const parsed = JSON.parse(plain);
    if (parsed && parsed._enc === true) return plain;
  } catch {
    // not an envelope
  }
  try {
    const { ciphertextB64, ivB64, authTagB64, keyId } = encryptChatText(plain);
    return JSON.stringify({
      _enc: true,
      keyId,
      iv: ivB64,
      tag: authTagB64,
      ciphertext: ciphertextB64
    });
  } catch (e) {
    console.warn('[clinicalNoteCrypto] encrypt failed; storing plaintext', e?.message);
    return plain;
  }
}

export function maybeDecryptNotePayload(value) {
  const raw = value == null ? '' : String(value);
  if (!raw) return raw;
  try {
    const parsed = JSON.parse(raw);
    if (!(parsed && parsed._enc === true)) return raw;
    if (!isChatEncryptionConfigured()) return raw;
    return decryptChatText({
      ciphertextB64: parsed.ciphertext,
      ivB64: parsed.iv,
      authTagB64: parsed.tag,
      keyId: parsed.keyId
    });
  } catch {
    return raw;
  }
}
