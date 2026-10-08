import { encryptChatText, decryptChatText, isChatEncryptionConfigured } from './chatEncryption.service.js';

export function protectQueuedMessage({ channel, body, subject, payload }) {
  if (channel !== 'secure') return { body, subject, payload };
  if (!isChatEncryptionConfigured()) throw Object.assign(new Error('Secure message encryption is unavailable'), { status: 503 });
  return { body: null, subject: null, payload: { secureEnvelope: encryptChatText(JSON.stringify({ body, subject, payload })) } };
}

export function openQueuedMessage(row) {
  if (!row || row.channel !== 'secure') return row;
  const payload = typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload_json;
  if (!payload?.secureEnvelope) return row; // Existing queued messages remain readable by their owner.
  const data = JSON.parse(decryptChatText(payload.secureEnvelope));
  return { ...row, body: data.body, subject: data.subject, payload_json: data.payload };
}
