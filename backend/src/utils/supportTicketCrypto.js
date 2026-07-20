import {
  decryptChatText,
  encryptChatText,
  isChatEncryptionConfigured
} from '../services/chatEncryption.service.js';

/**
 * Encrypt plaintext for ticket storage. Returns null fields when encryption is not configured.
 * When configured, plaintext is cleared (body/question/answer stored as NULL).
 */
export function prepareEncryptedTicketText(plaintext) {
  const text = String(plaintext ?? '');
  if (!isChatEncryptionConfigured()) {
    return {
      plain: text,
      ciphertext: null,
      iv: null,
      authTag: null,
      keyId: null,
      encrypted: false
    };
  }
  try {
    const enc = encryptChatText(text);
    return {
      plain: null,
      ciphertext: enc.ciphertextB64,
      iv: enc.ivB64,
      authTag: enc.authTagB64,
      keyId: enc.keyId,
      encrypted: true
    };
  } catch (e) {
    console.warn('[support-tickets] Encryption failed, storing plaintext:', e?.message || e);
    return {
      plain: text,
      ciphertext: null,
      iv: null,
      authTag: null,
      keyId: null,
      encrypted: false
    };
  }
}

export function resolveTicketPlaintext(row, { plainKey, cipherKey, ivKey, tagKey, keyIdKey }) {
  const plain = row?.[plainKey];
  if (plain != null && String(plain).length > 0) return String(plain);
  const ciphertext = row?.[cipherKey];
  const iv = row?.[ivKey];
  const authTag = row?.[tagKey];
  if (!ciphertext || !iv || !authTag) return plain != null ? String(plain) : '';
  try {
    return decryptChatText({
      ciphertextB64: ciphertext,
      ivB64: iv,
      authTagB64: authTag,
      keyId: row?.[keyIdKey] || null
    });
  } catch {
    return '[Unable to decrypt]';
  }
}

export function decryptTicketRow(ticket) {
  if (!ticket || typeof ticket !== 'object') return ticket;
  const out = { ...ticket };
  out.question = resolveTicketPlaintext(ticket, {
    plainKey: 'question',
    cipherKey: 'question_ciphertext',
    ivKey: 'question_iv',
    tagKey: 'question_auth_tag',
    keyIdKey: 'question_encryption_key_id'
  });
  if (ticket.answer != null || ticket.answer_ciphertext) {
    out.answer = resolveTicketPlaintext(ticket, {
      plainKey: 'answer',
      cipherKey: 'answer_ciphertext',
      ivKey: 'answer_iv',
      tagKey: 'answer_auth_tag',
      keyIdKey: 'answer_encryption_key_id'
    });
  }
  // Strip ciphertext from API payloads
  delete out.question_ciphertext;
  delete out.question_iv;
  delete out.question_auth_tag;
  delete out.question_encryption_key_id;
  delete out.answer_ciphertext;
  delete out.answer_iv;
  delete out.answer_auth_tag;
  delete out.answer_encryption_key_id;
  return out;
}

export function decryptTicketMessageRow(msg) {
  if (!msg || typeof msg !== 'object') return msg;
  const out = { ...msg };
  if (out.is_deleted === 1 || out.is_deleted === true) {
    out.body = '';
  } else {
    out.body = resolveTicketPlaintext(msg, {
      plainKey: 'body',
      cipherKey: 'body_ciphertext',
      ivKey: 'body_iv',
      tagKey: 'body_auth_tag',
      keyIdKey: 'encryption_key_id'
    });
  }
  delete out.body_ciphertext;
  delete out.body_iv;
  delete out.body_auth_tag;
  delete out.encryption_key_id;
  return out;
}

export function ticketDisplayStatus(ticket) {
  const status = String(ticket?.status || '').toLowerCase();
  if (status === 'closed') return 'closed';
  if (status === 'answered') return 'waiting';
  if (status === 'open' && ticket?.claimed_by_user_id) return 'in_progress';
  if (status === 'open') return 'open';
  return status || 'open';
}

export { isChatEncryptionConfigured };
