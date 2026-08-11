import { encryptChatText, decryptChatText, isChatEncryptionConfigured } from './chatEncryption.service.js';

export const ENCRYPTED_TASK_DESCRIPTION_PLACEHOLDER =
  'Encrypted clinical intake details. Open this task while signed in to view the full summary.';

export function isTaskDescriptionEncryptionConfigured() {
  return isChatEncryptionConfigured();
}

export function encryptTaskDescriptionText(text) {
  const value = String(text || '');
  if (!value || !isTaskDescriptionEncryptionConfigured()) return null;
  try {
    return encryptChatText(value);
  } catch {
    return null;
  }
}

export function decryptTaskDescriptionRow(row) {
  const ciphertext = row?.description_ciphertext;
  const iv = row?.description_iv;
  const tag = row?.description_auth_tag;
  const keyId = row?.description_encryption_key_id;
  if (!ciphertext || !iv || !tag) return null;
  if (!isTaskDescriptionEncryptionConfigured()) return null;
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

export function resolveTaskDescriptionPlaintext(row) {
  if (!row) return '';
  const decrypted = decryptTaskDescriptionRow(row);
  if (decrypted != null) return String(decrypted);
  return String(row.description || '');
}
