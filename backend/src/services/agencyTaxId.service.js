/**
 * Encrypt / decrypt agency tax IDs (EIN or SSN) at rest when chat encryption is configured.
 */
import { encryptChatText, decryptChatText, isChatEncryptionConfigured } from './chatEncryption.service.js';

export function normalizeTaxIdDigits(raw) {
  return String(raw || '').replace(/\D/g, '');
}

export function taxIdLast4(raw) {
  const digits = normalizeTaxIdDigits(raw);
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

export function formatTaxIdForDisplay(raw, type = 'ein') {
  const digits = normalizeTaxIdDigits(raw);
  if (!digits) return '';
  if (String(type || '').toLowerCase() === 'ssn' && digits.length === 9) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  }
  if (digits.length === 9) {
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  }
  return String(raw || '').trim();
}

export function packAgencyTaxId(plainTaxId) {
  const plain = String(plainTaxId || '').trim();
  if (!plain) {
    return {
      tax_id: null,
      tax_id_ciphertext: null,
      tax_id_iv: null,
      tax_id_auth_tag: null,
      tax_id_key_id: null,
      tax_id_last4: null
    };
  }
  const last4 = taxIdLast4(plain);
  if (isChatEncryptionConfigured()) {
    try {
      const enc = encryptChatText(plain);
      return {
        tax_id: null,
        tax_id_ciphertext: enc.ciphertextB64,
        tax_id_iv: enc.ivB64,
        tax_id_auth_tag: enc.authTagB64,
        tax_id_key_id: enc.keyId || null,
        tax_id_last4: last4
      };
    } catch {
      // fall through to plaintext storage
    }
  }
  return {
    tax_id: plain.slice(0, 32),
    tax_id_ciphertext: null,
    tax_id_iv: null,
    tax_id_auth_tag: null,
    tax_id_key_id: null,
    tax_id_last4: last4
  };
}

export function unpackAgencyTaxId(row = {}) {
  if (row?.tax_id_ciphertext && row?.tax_id_iv && row?.tax_id_auth_tag) {
    try {
      const plain = decryptChatText({
        ciphertextB64: row.tax_id_ciphertext,
        ivB64: row.tax_id_iv,
        authTagB64: row.tax_id_auth_tag,
        keyId: row.tax_id_key_id
      });
      if (plain) return plain;
    } catch {
      // fall through
    }
  }
  return row?.tax_id ? String(row.tax_id) : null;
}

export default {
  normalizeTaxIdDigits,
  taxIdLast4,
  formatTaxIdForDisplay,
  packAgencyTaxId,
  unpackAgencyTaxId
};
