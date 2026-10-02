import { encryptChatText, decryptChatText } from './chatEncryption.service.js';

// Legacy plaintext remains readable for migration. All nonempty writes must encrypt.
export function maybeEncryptNotePayload(value) {
  const plain = value == null ? '' : String(value);
  if (!plain) return plain;
  let parsed;
  try { parsed = JSON.parse(plain); } catch { /* Plain text is encrypted below. */ }
  if (parsed?._enc === true) { maybeDecryptNotePayload(plain); return plain; }
  const { ciphertextB64, ivB64, authTagB64, keyId } = encryptChatText(plain);
  return JSON.stringify({ _enc: true, keyId, iv: ivB64, tag: authTagB64, ciphertext: ciphertextB64 });
}

export function maybeDecryptNotePayload(value) {
  const raw = value == null ? '' : String(value);
  if (!raw) return raw;
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return raw; }
  if (parsed?._enc !== true) return raw;
  // Never treat an unreadable envelope as plaintext or overwrite it on a partial update.
  return decryptChatText({ ciphertextB64: parsed.ciphertext, ivB64: parsed.iv, authTagB64: parsed.tag, keyId: parsed.keyId });
}
