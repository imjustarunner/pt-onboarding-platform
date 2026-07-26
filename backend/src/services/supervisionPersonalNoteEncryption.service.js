import { encryptChatText, decryptChatText, isChatEncryptionConfigured } from './chatEncryption.service.js';

export function isSupervisionPersonalNoteEncryptionConfigured() {
  return isChatEncryptionConfigured();
}

export function encryptPersonalNoteText(text) {
  const value = String(text || '');
  if (!isSupervisionPersonalNoteEncryptionConfigured()) return null;
  try {
    return encryptChatText(value);
  } catch {
    return null;
  }
}

export function decryptPersonalNoteText(row) {
  const ciphertext = row?.note_ciphertext ?? row?.noteCiphertext;
  const iv = row?.note_iv ?? row?.noteIv;
  const tag = row?.note_auth_tag ?? row?.noteAuthTag;
  const keyId = row?.encryption_key_id ?? row?.encryptionKeyId;
  if (!ciphertext || !iv || !tag) return null;
  if (!isSupervisionPersonalNoteEncryptionConfigured()) return null;
  try {
    return decryptChatText({
      ciphertextB64: ciphertext,
      ivB64: iv,
      authTagB64: tag,
      keyId
    });
  } catch {
    return null;
  }
}

export function resolvePersonalNotePlaintext(row) {
  if (!row) return '';
  const decrypted = decryptPersonalNoteText(row);
  if (decrypted != null) return String(decrypted);
  return String(row.note_text || row.noteText || '');
}
