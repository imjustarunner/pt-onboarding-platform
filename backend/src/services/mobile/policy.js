import crypto from 'node:crypto';
import {STAFF_ROLES as workforceRoles} from '../../utils/staffEligibility.js';

export const MOBILE_COOKIE = '__Secure-auricwell_mobile_device';
export const MOBILE_CLIENTS = Object.freeze({
  web: { redirectUri: 'https://auricwell.com/mobile/callback' },
  ios: { redirectUri: 'com.auricwell.mobile://auth' }
});
export const DEVICE_IDLE_MS = 90 * 24 * 60 * 60 * 1000;
// Local unlock/continued activity cannot extend primary account authentication.
export const PRIMARY_AUTH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const MOBILE_INACTIVITY_MS = 60 * 60 * 1000;
export const MAX_CODE_ATTEMPTS = 5;
export const STAFF_ROLES = new Set([...workforceRoles,'clinical_director','school_staff','school_admin','schedule_manager']);
export const digest = value => crypto.createHash('sha256').update(String(value)).digest('hex');
export const opaqueToken = () => crypto.randomBytes(32).toString('base64url');
export const failure = (status, code, message) => Object.assign(new Error(message), { status, code });
export function validClient(client, redirectUri) {
  if (!Object.hasOwn(MOBILE_CLIENTS,client) || redirectUri !== MOBILE_CLIENTS[client].redirectUri) throw failure(400,'MOBILE_CLIENT_INVALID','This app sign-in request is invalid.');
  return client;
}
export function validChallenge(value) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(String(value || ''))) throw failure(400,'MOBILE_CHALLENGE_INVALID','Restart the app sign-in.');
  return value;
}
export function verifyChallenge(verifier, challenge) {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(String(verifier || ''))) return false;
  const derived=crypto.createHash('sha256').update(verifier).digest('base64url');
  return derived.length===String(challenge).length && crypto.timingSafeEqual(Buffer.from(derived),Buffer.from(challenge));
}
export function accountFingerprint(user) {
  return digest(JSON.stringify([user.id,user.password_hash || '',user.identity_product || 'full_suite']));
}
export function requireQuickCode(value) {
  if (!/^\d{6}$/.test(String(value || ''))) throw failure(400,'MOBILE_CODE_INVALID','Enter a six-digit quick access code.');
  return String(value);
}
