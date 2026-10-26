import { encryptChatText } from './chatEncryption.service.js';

/** Ticket email bodies must fail closed if the configured key is unavailable. */
export function encryptSupportEmailText(text) {
  const enc = encryptChatText(String(text || ''));
  return { plain: null, ciphertext: enc.ciphertextB64, iv: enc.ivB64, authTag: enc.authTagB64, keyId: enc.keyId };
}
