import { isChatEncryptionConfigured, getChatEncryptionKeyId } from '../services/chatEncryption.service.js';

function safeLen(v) {
  if (v === undefined || v === null) return null;
  return String(v).trim().length;
}

function tryParseKeyRing(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return { _error: 'Invalid JSON' };
  }
}

// This script intentionally does NOT print any key material.
console.log('Chat encryption configuration check');
console.log('----------------------------------');
console.log(`NODE_ENV=${process.env.NODE_ENV || ''}`);
console.log(`CLIENT_CHAT_ENCRYPTION_KEY_ID=${getChatEncryptionKeyId()}`);
console.log(`CLIENT_CHAT_ENCRYPTION_KEY_BASE64 length=${safeLen(process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64)}`);
console.log(`CLIENT_CHAT_ENCRYPTION_KEYS_JSON length=${safeLen(process.env.CLIENT_CHAT_ENCRYPTION_KEYS_JSON)}`);
console.log(`isChatEncryptionConfigured()=${isChatEncryptionConfigured()}`);

const ring = tryParseKeyRing(process.env.CLIENT_CHAT_ENCRYPTION_KEYS_JSON);
if (ring && ring._error) {
  console.log(`Key ring parse: ${ring._error}`);
} else if (ring) {
  const keys = Object.keys(ring);
  console.log(`Key ring entries: ${keys.length}`);
  // Only print ids and lengths
  for (const k of keys) {
    console.log(`- ${k}: length=${safeLen(ring[k])}`);
  }
} else {
  console.log('Key ring entries: 0');
}

