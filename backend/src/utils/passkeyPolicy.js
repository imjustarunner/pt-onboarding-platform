import { securityError } from './accountSecurity.js';
const roles = new Set(['client_guardian', 'provider', 'provider_plus', 'intern', 'intern_plus']);
export const passkeyRoleAllowed = user => roles.has(String(user?.role || '').toLowerCase());
export function assertPasskeyAccount(user, now = Date.now()) {
 const expires = user?.status_expires_at == null ? null : new Date(user.status_expires_at).getTime();
 if (!passkeyRoleAllowed(user) || ![true,1,'1'].includes(user?.is_active) || [true,1,'1'].includes(user?.is_archived)
   || [true,1,'1'].includes(user?.pending_access_locked) || user?.status !== 'ACTIVE_EMPLOYEE'
   || (expires !== null && (!Number.isFinite(expires) || expires <= now))) {
  throw securityError('PASSKEY_ACCOUNT_UNAVAILABLE', 'Passkey access is unavailable for this account. Use your usual sign-in or contact support.', 403);
 }
}
export function passkeySite(origin, allowedOrigins) {
 let url; try { url = new URL(origin); } catch { /* reject missing / opaque origins */ }
 if (!url || url.origin !== origin || !allowedOrigins.includes(origin)
   || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname)))) {
  throw securityError('PASSKEY_ORIGIN', 'Open your saved portal address to use a passkey.', 403);
 }
 return { origin, rpID: url.hostname };
}
