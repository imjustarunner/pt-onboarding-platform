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
}

export default DocumentEncryptionService;
