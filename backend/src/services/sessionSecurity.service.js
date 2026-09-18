import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import pool from '../config/database.js';
import { normalizeSessionRole, resolveSessionPolicy, sessionSecurityState } from '../utils/sessionSecurityPolicy.js';

const policyCache = new Map();
export function invalidateSessionPolicyCache() { policyCache.clear(); }

export function sessionSecurityError(code, message, status = 423, session = null) {
  return Object.assign(new Error(message), { code, status, session });
}

export async function loadSessionPolicy(user) {
  const cacheKey = `${user.id || user.email}:${user.role || user.type}`;
  const cached = policyCache.get(cacheKey);
  if (cached && cached.until > Date.now()) return cached.policy;
  const [[preferences], [agencies], [branding]] = await Promise.all([
    pool.execute('SELECT session_lock_enabled, inactivity_timeout_minutes, session_lock_pin_hash FROM user_preferences WHERE user_id = ? LIMIT 1', [user.id || null]),
    normalizeSessionRole(user.role) === 'super_admin'
      ? pool.execute('SELECT session_settings_json FROM agencies WHERE is_active = 1')
      : user.id ? pool.execute(`SELECT a.session_settings_json FROM agencies a
      INNER JOIN user_agencies ua ON ua.agency_id = a.id WHERE ua.user_id = ? AND a.is_active = 1 AND COALESCE(ua.is_active, 1) = 1`, [user.id])
      : pool.execute('SELECT session_settings_json FROM agencies WHERE id = ?', [user.agencyId || null]),
    pool.execute('SELECT max_inactivity_timeout_minutes FROM platform_branding ORDER BY id DESC LIMIT 1')
  ]);
  const settings = agencies.map(a => typeof a.session_settings_json === 'string'
    ? JSON.parse(a.session_settings_json || '{}') : (a.session_settings_json || {}));
  const policy = resolveSessionPolicy({ role: user.role, settings, preferences: preferences[0] || {}, platformMax: branding[0]?.max_inactivity_timeout_minutes });
  if (policyCache.size > 5000) policyCache.clear();
  policyCache.set(cacheKey, { policy, until: Date.now() + 30000 });
  return policy;
}

export async function getSessionSecurity(decoded, token) {
  if (decoded.id || (decoded.type === 'approved_employee' && decoded.email)) {
    const [cutoffs] = decoded.id
      ? await pool.execute('SELECT reject_issued_before FROM user_auth_revocations WHERE user_id = ?', [decoded.id])
      : await pool.execute('SELECT r.reject_issued_before FROM user_auth_revocations r JOIN users u ON u.id = r.user_id WHERE u.email = ?', [decoded.email]);
    if (cutoffs[0] && (!Number.isFinite(Number(decoded.iat)) || Number(decoded.iat) < Number(cutoffs[0].reject_issued_before))) {
      throw sessionSecurityError('SESSION_EXPIRED', 'An administrator ended your sessions. Sign in again.', 401);
    }
  }
  if ((!decoded.id && decoded.type !== 'approved_employee') || ['kiosk', 'school_events_kiosk', 'event_day_kiosk', 'program_event_kiosk', 'skill_builders_kiosk'].includes(decoded.type)) return null;
  const key = crypto.createHash('sha256').update(`${decoded.id || decoded.email}:${decoded.sessionId || token}`).digest('hex');
  const policy = await loadSessionPolicy(decoded);
  const [rows] = await pool.execute('SELECT * FROM auth_session_security WHERE session_key = ?', [key]);
  let row = rows[0];
  if (!row) {
    // A page reload must never start a new idle clock. JWT issuance anchors first use.
    const issued = new Date(Number(decoded.iat) * 1000);
    if (!Number.isFinite(issued.getTime()) || !decoded.exp) throw sessionSecurityError('SESSION_EXPIRED', 'Sign in again', 401);
    await pool.execute(`INSERT IGNORE INTO auth_session_security
      (session_key, user_id, last_activity_at, absolute_expires_at) VALUES (?, ?, ?, ?)`,
    [key, decoded.id || null, issued, Number(decoded.exp) * 1000]);
    const [fresh] = await pool.execute('SELECT * FROM auth_session_security WHERE session_key = ?', [key]);
    row = fresh[0];
  }
  const state = sessionSecurityState(row, policy);
  if (state.phase === 'expired' && !row.revoked_at) {
    const [result] = await pool.execute(`UPDATE auth_session_security SET revoked_at = ?, end_reason = 'Session timed out'
      WHERE session_key = ? AND last_activity_at = ? AND locked_at <=> ? AND revoked_at IS NULL`, [new Date(state.expiresAt), key, row.last_activity_at, row.locked_at || null]);
    // An unlock may have committed after our SELECT. Never revoke that newer
    // activity based on the older snapshot's elapsed deadline.
    if (!result.affectedRows) return getSessionSecurity(decoded, token);
    // End the ledger and payroll clock at the actual deadline, even after sleep.
    if (result.affectedRows) await finalizeExpiredSession(decoded, state.expiresAt);
  }
  return { key, policy, state };
}

export async function finalizeExpiredSession(user, expiresAt) {
  if (!user.id) return;
  const at = new Date(Math.min(Date.now(), expiresAt));
  if (!Number.isFinite(at.getTime())) return;
  try {
    const { default: Ledger } = await import('../models/UserPlatformSession.model.js');
    if (user.sessionId) await Ledger.endSession({ sessionId: user.sessionId, reason: 'timeout', finalPhase: 'timedown' });
    const { clearUserLivePresence } = await import('../controllers/presence.controller.js');
    await clearUserLivePresence(user.id);
    const { default: Payroll } = await import('../models/PayrollIndirectTimeSession.model.js');
    const [open] = await pool.execute("SELECT id FROM payroll_indirect_time_sessions WHERE user_id = ? AND status IN ('open', 'on_break') AND clocked_in_at <= ?", [user.id, at]);
    for (const row of open) await Payroll.clockOut(row.id, at);
  } catch (error) {
    console.error('[sessionSecurity] timeout cleanup failed:', error.message);
  }
}

// Serializes guesses with the existing Quick View counter across API instances,
// sessions and tabs. Does not create a Quick View session or expose its token.
async function verifyQuickViewPin(connection, userId, pin) {
  const [rows] = await connection.execute('SELECT * FROM user_quick_view_credentials WHERE user_id = ? FOR UPDATE', [userId]);
  const cred = rows[0];
  if (!cred?.passcode_hash) throw sessionSecurityError('PIN_NOT_SET', 'Sign in again and set up your Quick View passcode in My Preferences.');
  if (Number(cred.failed_passcode_attempts) >= 3 || (cred.passcode_locked_until && new Date(cred.passcode_locked_until).getTime() > Date.now())) {
    throw sessionSecurityError('PIN_LOCKED', 'Sign in again and reset your Quick View passcode.');
  }
  const valid = /^\d{6}$/.test(pin) && await bcrypt.compare(pin, cred.passcode_hash);
  await connection.execute(`UPDATE user_quick_view_credentials SET
    failed_passcode_attempts = ?, passcode_locked_until = ?,
    last_passcode_ok_at = CASE WHEN ? THEN NOW() ELSE last_passcode_ok_at END WHERE user_id = ?`,
  [valid ? 0 : Number(cred.failed_passcode_attempts || 0) + 1,
    !valid && Number(cred.failed_passcode_attempts || 0) >= 2 ? '2099-12-31 23:59:59' : null, valid, userId]);
  return valid;
}

export async function changeSessionSecurity(security, userId, action, pin = '') {
  if (!security) throw sessionSecurityError('SESSION_EXPIRED', 'Sign in again', 401);
  const connection = await pool.getConnection();
  let failure = null;
  let state;
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute('SELECT * FROM auth_session_security WHERE session_key = ? AND user_id <=> ? FOR UPDATE', [security.key, userId || null]);
    const row = rows[0];
    if (!row) throw sessionSecurityError('SESSION_EXPIRED', 'Sign in again', 401);
    state = sessionSecurityState(row, security.policy);
    if (action === 'logout' || state.phase === 'expired') {
      await connection.execute('UPDATE auth_session_security SET revoked_at = COALESCE(revoked_at, NOW(3)), end_reason = COALESCE(end_reason, ?) WHERE session_key = ?', [action === 'logout' ? 'Signed out' : 'Session timed out', security.key]);
      state.phase = 'expired';
      if (action !== 'logout') failure = sessionSecurityError('SESSION_EXPIRED', 'Your session ended. Sign in again.', 401, state);
    } else if (action === 'lock') {
      row.locked_at = new Date(Math.min(Date.now(), state.lockAt));
      await connection.execute('UPDATE auth_session_security SET locked_at = ? WHERE session_key = ?', [row.locked_at, security.key]);
      state = sessionSecurityState(row, security.policy);
    } else if (action === 'activity' && state.phase !== 'active') {
      failure = sessionSecurityError('SESSION_LOCKED', 'Unlock your session to continue.', 423, state);
    } else if (action === 'resume' && security.policy.useLockScreen) {
      let valid;
      if (Number(row.failed_pin_attempts) >= 3) throw sessionSecurityError('PIN_LOCKED', 'Sign in again to continue.');
      if (security.policy.pinRequired) valid = await verifyQuickViewPin(connection, userId, String(pin));
      else {
        const [prefs] = await connection.execute('SELECT session_lock_pin_hash FROM user_preferences WHERE user_id = ?', [userId]);
        valid = /^\d{4}$/.test(String(pin)) && !!prefs[0]?.session_lock_pin_hash && await bcrypt.compare(String(pin), prefs[0].session_lock_pin_hash);
      }
      if (!valid) {
        const attempts = Number(row.failed_pin_attempts || 0) + 1;
        await connection.execute(`UPDATE auth_session_security SET failed_pin_attempts = ?,
          revoked_at = CASE WHEN ? THEN NOW(3) ELSE revoked_at END WHERE session_key = ?`, [attempts, attempts >= 3, security.key]);
        failure = attempts >= 3
          ? sessionSecurityError('SESSION_EXPIRED', 'Too many incorrect codes. Sign in again.', 401, { ...state, phase: 'expired' })
          : sessionSecurityError('INVALID_PIN', 'Incorrect code. After 3 attempts you must sign in again.', 422, state);
      }
    }
    // Recheck after bcrypt: a code submitted at expiry cannot revive the session.
    if (!failure && ['activity', 'resume'].includes(action)) {
      if (Date.now() >= state.expiresAt) failure = sessionSecurityError('SESSION_EXPIRED', 'Your session ended. Sign in again.', 401, { ...state, phase: 'expired' });
      else {
        row.last_activity_at = new Date(); row.locked_at = null;
        await connection.execute('UPDATE auth_session_security SET last_activity_at = ?, locked_at = NULL, failed_pin_attempts = 0 WHERE session_key = ?', [row.last_activity_at, security.key]);
        state = sessionSecurityState(row, security.policy);
      }
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
  if (failure) throw failure;
  return state;
}

const LOCK_ROUTES = new Set([
  'GET /api/auth/session-lock-config', 'POST /api/auth/session-activity',
  'POST /api/auth/verify-session-pin', 'POST /api/auth/logout',
  'POST /api/auth/platform-session/heartbeat', 'POST /api/presence/heartbeat',
  'POST /api/presence/offline', 'GET /api/presence/me'
]);
export function sessionRouteAllowed(security, method, path) {
  if (!security) return true;
  const route = `${method} ${path.replace(/\/$/, '')}`;
  if (route === 'POST /api/auth/logout') return true;
  if (security.state.phase === 'expired') return false;
  return security.state.phase === 'active' || LOCK_ROUTES.has(route);
}
