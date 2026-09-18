import crypto from 'node:crypto';
import { TOTP, Secret } from 'otpauth';

export const hashSecurityToken = value => crypto.createHash('sha256').update(String(value)).digest('hex');
export const securityError = (code, message, status = 400) => Object.assign(new Error(message), { code, status });
export const authenticator = (secret, label = 'Your account') => new TOTP({ issuer: 'PlotTwistHQ', label, algorithm: 'SHA1', digits: 6, period: 30, secret });
export const newAuthenticatorSecret = () => new Secret({ size: 20 }).base32;
export function verifiedCounter(secret, code, lastCounter = -1, now = Date.now()) {
  if (!/^\d{6}$/.test(String(code))) return null;
  const delta = authenticator(secret).validate({ token: String(code), window: 1, timestamp: now });
  const counter = Math.floor(now / 30000) + (delta ?? 0);
  return delta !== null && counter > Number(lastCounter ?? -1) ? counter : null;
}
function encryptionKey() {
  const key = Buffer.from(process.env.MFA_ENCRYPTION_KEY_BASE64 || '', 'base64');
  if (key.length !== 32) throw securityError('MFA_UNAVAILABLE', 'Two-step verification setup is temporarily unavailable. Contact your administrator.', 503);
  return key;
}
export function sealMfaSecret(secret, userId) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`account-mfa:${userId}`));
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString('base64'), data: encrypted.toString('base64'), tag: cipher.getAuthTag().toString('base64') });
}
export function openMfaSecret(raw, userId) {
  const item = JSON.parse(raw);
  if (item.v !== 1) throw securityError('MFA_UNAVAILABLE', 'Unsupported authenticator key version.', 503);
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(item.iv, 'base64'));
  decipher.setAAD(Buffer.from(`account-mfa:${userId}`));
  decipher.setAuthTag(Buffer.from(item.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(item.data, 'base64')), decipher.final()]).toString('utf8');
}
export function makeRecoveryCodes() {
  const codes = Array.from({ length: 10 }, () => crypto.randomBytes(16).toString('hex').match(/.{1,8}/g).join('-'));
  return { codes, hashes: codes.map(recoveryHash) };
}
export const recoveryHash = code => hashSecurityToken(String(code || '').replace(/[\s-]/g, '').toLowerCase());
export const rememberedDays = () => [0, 7, 30].includes(Number(process.env.MFA_REMEMBER_DAYS ?? 30)) ? Number(process.env.MFA_REMEMBER_DAYS ?? 30) : 0;
export const MFA_STAFF_ROLES = new Set(['super_admin', 'admin', 'agency_admin', 'support', 'staff', 'clinician', 'provider', 'provider_plus', 'intern', 'intern_plus', 'supervisor', 'clinical_practice_assistant', 'school_staff', 'schedule_manager', 'facilitator', 'backoffice_admin', 'club_manager']);
// Enrollment is voluntary during rollout. Keep this server-owned: browser
// parameters and enrollment state must not turn optional setup into an access gate.
export function requiresStaffMfa(_role) {
  return false;
}

// A limited roster is an explicit allowlist. Never recursively redact arbitrary
// JSON: client names can also occur in notes, search fields and filenames.
const rosterFields = new Set(['id', 'organization_id', 'organization_name', 'initials', 'identifier_code', 'client_status_id', 'client_status_key', 'client_status_label', 'grade', 'school_year', 'provider_id', 'provider_ids', 'school_staff_access_level', 'school_staff_effective_access_state', 'school_portal_force_code', 'school_portal_gray']);
export function limitedRoster(body) {
  if (!Array.isArray(body)) return body;
  return body.map(row => ({ ...Object.fromEntries(Object.entries(row).filter(([key]) => rosterFields.has(key))), full_name: null, school_portal_can_open: false, requires_two_factor: true }));
}
