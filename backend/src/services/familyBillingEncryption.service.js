import crypto from 'node:crypto';

function keyFor(id) {
  const currentId = process.env.FAMILY_BILLING_ENCRYPTION_KEY_ID || 'v1';
  const previous = JSON.parse(process.env.FAMILY_BILLING_PREVIOUS_KEYS_JSON || '{}');
  const encoded = id === currentId ? process.env.FAMILY_BILLING_ENCRYPTION_KEY_BASE64 : previous[id];
  const key = Buffer.from(encoded || '', 'base64');
  if (key.length !== 32) throw new Error('Family billing encryption key is unavailable');
  return key;
}

export function encryptFamilyBilling(value, context) {
  const keyId = process.env.FAMILY_BILLING_ENCRYPTION_KEY_ID || 'v1';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFor(keyId), iv);
  cipher.setAAD(Buffer.from(String(context)));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return JSON.stringify({ v: 1, keyId, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') });
}

export function decryptFamilyBilling(raw, context) {
  if (!raw) return null;
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (data.v !== 1) throw new Error('Unsupported family billing encryption version');
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyFor(data.keyId), Buffer.from(data.iv, 'base64'));
  decipher.setAAD(Buffer.from(String(context)));
  decipher.setAuthTag(Buffer.from(data.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
}

export function assertFamilyBillingEncryption() {
  keyFor(process.env.FAMILY_BILLING_ENCRYPTION_KEY_ID || 'v1');
}
