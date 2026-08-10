import crypto from 'crypto';
import { KeyManagementServiceClient } from '@google-cloud/kms';

let kmsClient = null;

function getKmsClient() {
  if (!kmsClient) {
    kmsClient = new KeyManagementServiceClient();
  }
  return kmsClient;
}

function getReferralKmsKeyName() {
  return process.env.REFERRAL_KMS_KEY || process.env.DOCUMENTS_KMS_KEY || null;
}

class DocumentEncryptionService {
  static isConfigured() {
    return !!getReferralKmsKeyName();
  }

  static async encryptBuffer(buffer, { aad } = {}) {
    const keyName = getReferralKmsKeyName();
    if (!keyName) {
      throw new Error('Referral encryption key not configured (REFERRAL_KMS_KEY)');
    }

    const dataKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', dataKey, iv);
    if (aad) {
      cipher.setAAD(Buffer.from(String(aad)));
    }
    const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const [encryptResponse] = await getKmsClient().encrypt({
      name: keyName,
      plaintext: dataKey
    });

    return {
      encryptedBuffer: ciphertext,
      encryptionKeyId: keyName,
      encryptionWrappedKeyB64: encryptResponse.ciphertext.toString('base64'),
      encryptionIvB64: iv.toString('base64'),
      encryptionAuthTagB64: authTag.toString('base64'),
      encryptionAlg: 'AES-256-GCM'
    };
  }

  static async decryptBuffer({ encryptedBuffer, encryptionKeyId, encryptionWrappedKeyB64, encryptionIvB64, encryptionAuthTagB64, aad }) {
    const keyName = encryptionKeyId || getReferralKmsKeyName();
    if (!keyName) {
      throw new Error('Referral encryption key not configured (REFERRAL_KMS_KEY)');
    }

    const [decryptResponse] = await getKmsClient().decrypt({
      name: keyName,
      ciphertext: Buffer.from(String(encryptionWrappedKeyB64 || ''), 'base64')
    });
    const dataKey = decryptResponse.plaintext;
    const iv = Buffer.from(String(encryptionIvB64 || ''), 'base64');
    const authTag = Buffer.from(String(encryptionAuthTagB64 || ''), 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', dataKey, iv);
    if (aad) {
      decipher.setAAD(Buffer.from(String(aad)));
    }
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
  }

  /**
   * Referral packet AAD has varied over time (filename sanitization changed Apr 2026).
   * Try current + legacy candidates so older encrypted docs still open.
   */
  static buildReferralPacketAadCandidates({ organizationId, originalName, sanitizeFilename }) {
    const orgNum = Number(organizationId || 0) || organizationId;
    const orgStr = organizationId != null ? String(organizationId) : '';
    const rawName = String(originalName || '');
    const sanitized = typeof sanitizeFilename === 'function'
      ? String(sanitizeFilename(rawName) || '')
      : rawName;
    // Pre-Apr-25-2026 sanitize: path chars only (kept spaces/commas).
    const legacySanitized = rawName
      .replace(/[\/\\\?\*\|"<>:]/g, '_')
      .replace(/^[\s.]+|[\s.]+$/g, '');

    const filenames = [...new Set([sanitized, rawName, legacySanitized].filter(Boolean))];
    const orgIds = [...new Set([orgNum, orgStr].filter((v) => v !== '' && v != null))];
    const candidates = [];
    for (const organizationIdValue of orgIds) {
      for (const filename of filenames) {
        candidates.push(JSON.stringify({
          organizationId: organizationIdValue,
          uploadType: 'referral_packet',
          filename
        }));
      }
    }
    return candidates;
  }

  static async decryptReferralPacketBuffer({
    encryptedBuffer,
    encryptionKeyId,
    encryptionWrappedKeyB64,
    encryptionIvB64,
    encryptionAuthTagB64,
    organizationId,
    originalName,
    sanitizeFilename
  }) {
    const candidates = this.buildReferralPacketAadCandidates({
      organizationId,
      originalName,
      sanitizeFilename
    });
    let lastError = null;
    for (const aad of candidates) {
      try {
        return await this.decryptBuffer({
          encryptedBuffer,
          encryptionKeyId,
          encryptionWrappedKeyB64,
          encryptionIvB64,
          encryptionAuthTagB64,
          aad
        });
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('Unable to decrypt referral packet');
  }
}

export default DocumentEncryptionService;
