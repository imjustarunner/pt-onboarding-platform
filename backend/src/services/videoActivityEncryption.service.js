/**
 * Video meeting activity encryption at rest.
 * Reuses CLIENT_CHAT_ENCRYPTION_KEY_BASE64 for consistency with platform chat.
 */

import { encryptChatText, decryptChatText, isChatEncryptionConfigured } from './chatEncryption.service.js';

export function isVideoActivityEncryptionConfigured() {
  return isChatEncryptionConfigured();
}

/**
 * Encrypt a payload object for storage.
 * @param {object} payload
 * @returns {{ ciphertextB64: string, ivB64: string, authTagB64: string, keyId: string }}
 */
export function encryptPayload(payload) {
  return encryptChatText(JSON.stringify(payload || {}));
}

/**
 * Decrypt a stored payload.
 * @param {{ payloadCiphertext?: string, payloadIv?: string, payloadAuthTag?: string, encryptionKeyId?: string }}
 * @param {object} fallbackPayload - If not encrypted, use payload_json
 * @returns {object}
 */
export function decryptPayload(row, fallbackPayload = {}) {
  const ciphertext = row?.payload_ciphertext ?? row?.payloadCiphertext;
  const iv = row?.payload_iv ?? row?.payloadIv;
  const tag = row?.payload_auth_tag ?? row?.payloadAuthTag;
  const keyId = row?.encryption_key_id ?? row?.encryptionKeyId;

  if (!ciphertext && !iv && !tag) {
    try {
      const raw = row?.payload_json ?? row?.payloadJson;
      return raw && typeof raw === 'object' ? raw : raw ? JSON.parse(raw) : fallbackPayload;
    } catch {
      return fallbackPayload;
    }
  }

  const plaintext = decryptChatText({ ciphertextB64: ciphertext, ivB64: iv, authTagB64: tag, keyId });
  return JSON.parse(plaintext);
}
