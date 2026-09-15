export const SESSION_PIN_ROLES = Object.freeze([
  'super_admin', 'admin', 'support', 'clinical_practice_assistant', 'staff',
  'provider', 'provider_plus', 'intern', 'intern_plus', 'school_staff',
  'supervisor', 'client_guardian', 'club_manager'
]);

export function normalizeSessionRole(role) {
  const value = String(role || '').trim().toLowerCase();
  return ['superadmin', 'super-admin', 'super admin'].includes(value) ? 'super_admin' : value;
}

export function validateSessionSettings(settings) {
  if (settings == null) return settings;
  if (typeof settings !== 'object' || Array.isArray(settings)) throw Object.assign(new Error('Session settings must be an object'), { status: 400, statusCode: 400 });
  if (settings.requireQuickViewPinRoles !== undefined &&
      (!Array.isArray(settings.requireQuickViewPinRoles) || settings.requireQuickViewPinRoles.some(r => !SESSION_PIN_ROLES.includes(r)))) {
    throw Object.assign(new Error('Select valid roles for the Quick View passcode requirement'), { status: 400, statusCode: 400 });
  }
  return settings;
}

const seconds = (value, fallback) => Number.isFinite(Number(value)) && value != null
  ? Math.min(3600, Math.max(30, Math.floor(Number(value)))) : fallback;

// Apply the strictest policy across memberships. Switching tabs/agency headers
// must not weaken protection for information already loaded from another agency.
export function resolveSessionPolicy({ role, settings = [], preferences = {}, platformMax = 30 }) {
  role = normalizeSessionRole(role);
  const privileged = ['admin', 'super_admin', 'support', 'clinical_practice_assistant'].includes(role);
  let idle = privileged ? 600 : 180;
  let timedown = 600;
  const max = Math.min(240, Math.max(1, Number(platformMax) || 30));
  let agencyMax = max;
  let pinRequired = false;
  if (settings.length) {
    idle = Math.min(...settings.map(s => seconds(s.idleBeforeTimedownSeconds, privileged ? 600 : 180)));
    timedown = Math.min(...settings.map(s => seconds(s.timedownSeconds ?? (s.timedownMinutes == null ? null : s.timedownMinutes * 60), 600)));
    if (privileged) { idle = Math.min(idle, 600); timedown = Math.min(timedown, 600); }
  }
  for (const s of settings) {
    const n = Number(s.maxInactivityTimeoutMinutes ?? s.max_inactivity_timeout_minutes);
    if (n >= 1) agencyMax = Math.min(agencyMax, n);
    if (Array.isArray(s.requireQuickViewPinRoles) && s.requireQuickViewPinRoles.map(normalizeSessionRole).includes(role)) pinRequired = true;
  }
  const sessionLockEnabled = [true, 1, '1'].includes(preferences.session_lock_enabled);
  const hasLegacyPin = !!preferences.session_lock_pin_hash;
  const timeout = Math.min(agencyMax, Math.max(1, Number(preferences.inactivity_timeout_minutes) || agencyMax));
  idle = Math.min(idle, agencyMax * 60, sessionLockEnabled ? timeout * 60 : Infinity);
  return {
    platformMaxMinutes: max, agencyMaxMinutes: agencyMax,
    sessionLockEnabled, inactivityTimeoutMinutes: timeout, effectiveTimeoutMinutes: timeout,
    pinRequired, pinType: pinRequired ? 'quick_view' : 'session', pinLength: pinRequired ? 6 : 4,
    useLockScreen: pinRequired || (sessionLockEnabled && hasLegacyPin),
    idleBeforeTimedownSeconds: idle, timedownSeconds: timedown
  };
}

export function sessionSecurityState(row, policy, now = Date.now()) {
  const lastActivityAt = new Date(row.last_activity_at).getTime();
  const lockAt = Math.min(lastActivityAt + policy.idleBeforeTimedownSeconds * 1000,
    row.locked_at ? new Date(row.locked_at).getTime() : Infinity);
  const expiresAt = Math.min(lockAt + policy.timedownSeconds * 1000, Number(row.absolute_expires_at));
  const phase = row.revoked_at || !Number.isFinite(expiresAt) || now >= expiresAt
    ? 'expired' : now >= lockAt ? 'timedown' : 'active';
  return { phase, lastActivityAt, activityVersion: lastActivityAt, lockAt, expiresAt, serverNow: now };
}
