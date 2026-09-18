import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import pool from '../config/database.js';
import { appendSecurityEvidence, mirrorSecurityEvidence } from './securityEvidence.service.js';
import { sessionReference } from '../utils/securityEvidence.js';
import { authenticator, newAuthenticatorSecret, verifiedCounter, sealMfaSecret, openMfaSecret, hashSecurityToken, makeRecoveryCodes, recoveryHash, rememberedDays, requiresStaffMfa, securityError } from '../utils/accountSecurity.js';

export const DEVICE_COOKIE = 'ptRememberedDevice';
export function requireAccountSession(req) {
  if (!Number.isSafeInteger(Number(req.user?.id)) || !req.sessionSecurity?.key || !req.user?.sessionId || req.user.demoMode || req.user.switchedFromUserId) {
    throw securityError('ACCOUNT_SESSION_REQUIRED', 'Sign in directly to your own account to manage its security.', 403);
  }
}
export async function accountSecurityState(req) {
  if (req.accountSecurityState) return req.accountSecurityState;
  if (!req.user?.id) return { enabled: false, verified: false, required: true };
  const [rows] = await pool.execute(`SELECT u.role, u.email, u.password_changed_at, u.temporary_password_set_at, m.enabled_at, m.factor_version,
    s.verified_at, s.factor_version session_version, s.device_id,
    d.revoked_at device_revoked_at, d.expires_at device_expires_at,
    r.reject_issued_before
    FROM users u LEFT JOIN account_mfa m ON m.user_id=u.id
    LEFT JOIN account_mfa_sessions s ON s.user_id=u.id AND s.session_key=?
    LEFT JOIN account_mfa_devices d ON d.id=s.device_id AND d.user_id=u.id
    LEFT JOIN user_auth_revocations r ON r.user_id=u.id WHERE u.id=?`, [req.sessionSecurity?.key || '', req.user.id]);
  const row = rows[0];
  if (!row) throw securityError('ACCOUNT_NOT_FOUND', 'Sign in again.', 401);
  const afterReset = at => at && new Date(at).getTime() >= Math.max(new Date(row.password_changed_at || 0).getTime(), new Date(row.temporary_password_set_at || 0).getTime(), Number(row.reject_issued_before || 0) * 1000);
  let verified = !!row.enabled_at && row.session_version === row.factor_version && afterReset(row.verified_at)
    && (!row.device_id || (!row.device_revoked_at && new Date(row.device_expires_at).getTime() > Date.now()));
  const rawDevice = req.cookies?.[DEVICE_COOKIE];
  if (!verified && row.enabled_at && /^[a-f0-9]{64}$/.test(rawDevice || '') && req.sessionSecurity?.key) {
    const [devices] = await pool.execute(`SELECT id,created_at FROM account_mfa_devices
      WHERE user_id=? AND token_hash=? AND factor_version=? AND revoked_at IS NULL AND expires_at>UTC_TIMESTAMP(3)`, [req.user.id, hashSecurityToken(rawDevice), row.factor_version]);
    if (devices[0] && afterReset(devices[0].created_at)) {
      await pool.execute(`INSERT INTO account_mfa_sessions (session_key,user_id,factor_version,verified_at,device_id)
        VALUES (?,?,?,UTC_TIMESTAMP(3),?) ON DUPLICATE KEY UPDATE factor_version=VALUES(factor_version),verified_at=VALUES(verified_at),device_id=VALUES(device_id)`, [req.sessionSecurity.key, req.user.id, row.factor_version, devices[0].id]);
      verified = true;
    }
  }
  const method = row.role === 'school_staff' ? 'email' : 'authenticator';
  let maskedEmail;
  if (method === 'email') {
    const { schoolEmailHash, maskedSchoolEmail } = await import('./schoolEmailVerification.service.js');
    const [[emailSession]] = await pool.execute('SELECT recipient_hash,verified_at FROM account_email_sessions WHERE user_id=? AND session_key=?', [req.user.id, req.sessionSecurity?.key || '']);
    verified ||= !!emailSession && emailSession.recipient_hash === schoolEmailHash(row.email) && !!afterReset(emailSession.verified_at);
    maskedEmail = maskedSchoolEmail(row.email);
  }
  return (req.accountSecurityState = { method, maskedEmail, enabled: method === 'email' || !!row.enabled_at, authenticatorEnabled: !!row.enabled_at, verified, required: requiresStaffMfa(String(row.role).toLowerCase()), rememberDays: method === 'email' ? 0 : rememberedDays() });
}

async function primaryProof(req, password) {
  const [rows] = await pool.execute('SELECT password_hash FROM users WHERE id=?', [req.user.id]);
  if (typeof password === 'string' && password.length <= 256 && rows[0]?.password_hash && await bcrypt.compare(password, rows[0].password_hash)) return;
  if (req.authClaims?.authMethod === 'google' && Number(req.authClaims.iat) * 1000 > Date.now() - 5 * 60000) return;
  throw securityError('PRIMARY_VERIFICATION_REQUIRED', 'Confirm your account password, or sign in with Google again and return here within five minutes.', 403);
}
async function recordSecurityAction(connection, req, action, details = {}) {
  const event = { ...req.evidenceContext, phase: 'administrative_action', userId: req.user.id, email: req.user.email, role: req.user.role, sessionRef: sessionReference(req.user.sessionId), action, outcome: 'succeeded', details };
  const id = await appendSecurityEvidence(event, connection, { mirror: false });
  return () => mirrorSecurityEvidence(event, id);
}
async function transaction(work) {
  const db = await pool.getConnection();
  try { await db.beginTransaction(); const result = await work(db); await db.commit(); result?.mirror?.(); if (result?.error) throw result.error; return result; }
  catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
}
const locked = row => row?.locked_until && new Date(row.locked_until).getTime() > Date.now();
async function failedAttempt(db, userId, row) {
  const failures = (row.locked_until && !locked(row) ? 0 : Number(row.failed_attempts || 0)) + 1;
  await db.execute('UPDATE account_mfa SET failed_attempts=?,locked_until=? WHERE user_id=?', [failures, failures >= 5 ? new Date(Date.now() + 15 * 60000) : null, userId]);
  return { error: securityError(failures >= 5 ? 'MFA_RATE_LIMITED' : 'MFA_INVALID_CODE', failures >= 5 ? 'Too many attempts. Try again in 15 minutes.' : 'That code is incorrect, expired, or already used. Try the next code.', failures >= 5 ? 429 : 422) };
}
export async function beginAuthenticator(req) {
  requireAccountSession(req);
  await primaryProof(req, req.body?.password);
  const secret = newAuthenticatorSecret();
  const cipher = sealMfaSecret(secret, req.user.id);
  await transaction(async db => {
    await db.execute('INSERT IGNORE INTO account_mfa (user_id) VALUES (?)', [req.user.id]);
    const [rows] = await db.execute('SELECT * FROM account_mfa WHERE user_id=? FOR UPDATE', [req.user.id]);
    if (rows[0].enabled_at) throw securityError('MFA_ALREADY_ENABLED', 'Two-step verification is already set up.', 409);
    if (locked(rows[0])) throw securityError('MFA_RATE_LIMITED', 'Try again in 15 minutes.', 429);
    await db.execute('UPDATE account_mfa SET pending_cipher=?,pending_session=?,pending_expires_at=? WHERE user_id=?', [cipher, req.sessionSecurity.key, new Date(Date.now() + 10 * 60000), req.user.id]);
    return { mirror: await recordSecurityAction(db, req, 'mfa_setup_started') };
  });
  return { secret, uri: authenticator(secret, req.user.email || `Account ${req.user.id}`).toString(), expiresInSeconds: 600 };
}

export async function verifyAuthenticator(req, enroll = false, reset = false) {
  requireAccountSession(req);
  if (reset) await primaryProof(req, req.body?.password);
  return transaction(async db => {
    const [rows] = await db.execute('SELECT * FROM account_mfa WHERE user_id=? FOR UPDATE', [req.user.id]);
    const row = rows[0];
    if (!row || (enroll ? row.enabled_at || row.pending_session !== req.sessionSecurity.key || new Date(row.pending_expires_at).getTime() <= Date.now() : !row.enabled_at)) throw securityError('MFA_SETUP_REQUIRED', 'Start authenticator setup again.', 409);
    if (locked(row)) throw securityError('MFA_RATE_LIMITED', 'Too many attempts. Try again in 15 minutes.', 429);
    let hashes = typeof row.recovery_hashes === 'string' ? JSON.parse(row.recovery_hashes) : row.recovery_hashes || [];
    const isRecovery = !enroll && req.body?.useRecoveryCode === true;
    const codeHash = isRecovery ? recoveryHash(req.body?.code) : null;
    const counter = isRecovery ? null : verifiedCounter(openMfaSecret(enroll ? row.pending_cipher : row.secret_cipher, req.user.id), req.body?.code, enroll ? -1 : row.last_counter);
    if (isRecovery ? !hashes.includes(codeHash) : counter === null) return failedAttempt(db, req.user.id, row);
    if (reset) {
      await db.execute(`UPDATE account_mfa SET secret_cipher=NULL,enabled_at=NULL,factor_version=factor_version+1,
        pending_cipher=NULL,pending_session=NULL,pending_expires_at=NULL,recovery_hashes=NULL,last_counter=NULL,failed_attempts=0,locked_until=NULL WHERE user_id=?`, [req.user.id]);
      await db.execute('UPDATE account_mfa_devices SET revoked_at=UTC_TIMESTAMP(3) WHERE user_id=? AND revoked_at IS NULL', [req.user.id]);
      await db.execute('DELETE FROM account_mfa_sessions WHERE user_id=?', [req.user.id]);
      await db.execute(`INSERT INTO user_auth_revocations (user_id,reject_issued_before,revoked_at,revoked_by_user_id)
        VALUES (?,UNIX_TIMESTAMP()+1,UTC_TIMESTAMP(3),?) ON DUPLICATE KEY UPDATE reject_issued_before=VALUES(reject_issued_before),revoked_at=VALUES(revoked_at),revoked_by_user_id=VALUES(revoked_by_user_id)`, [req.user.id,req.user.id]);
      await db.execute("UPDATE auth_session_security SET revoked_at=COALESCE(revoked_at,UTC_TIMESTAMP(3)),end_reason=COALESCE(end_reason,'Authenticator replaced') WHERE user_id=?", [req.user.id]);
      return { reset: true, mirror: await recordSecurityAction(db,req,'mfa_reset',{recoveryCode:isRecovery}) };
    }
    let recoveryCodes;
    if (enroll) { const recovery = makeRecoveryCodes(); recoveryCodes = recovery.codes; hashes = recovery.hashes; }
    else if (isRecovery) hashes = hashes.filter(hash => hash !== codeHash);
    await db.execute(`UPDATE account_mfa SET secret_cipher=?,enabled_at=COALESCE(enabled_at,UTC_TIMESTAMP(3)),
      pending_cipher=NULL,pending_session=NULL,pending_expires_at=NULL,last_counter=?,recovery_hashes=?,failed_attempts=0,locked_until=NULL WHERE user_id=?`, [enroll ? row.pending_cipher : row.secret_cipher, counter ?? row.last_counter, JSON.stringify(hashes), req.user.id]);
    let deviceToken = null;
    let deviceId = null;
    const days = rememberedDays();
    // Recovery-code use never silently creates a long-lived trusted device.
    if (!isRecovery && req.body?.rememberDevice === true && req.body?.personalDevice === true && days > 0) {
      deviceId = crypto.randomUUID(); deviceToken = crypto.randomBytes(32).toString('hex');
      await db.execute(`INSERT INTO account_mfa_devices (id,user_id,token_hash,factor_version,label,user_agent,created_at,expires_at)
        VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(3),?)`, [deviceId, req.user.id, hashSecurityToken(deviceToken), row.factor_version, String(req.body?.deviceLabel || 'Personal device').slice(0, 100), String(req.headers['user-agent'] || '').slice(0, 512), new Date(Date.now() + days * 86400000)]);
    }
    await db.execute(`INSERT INTO account_mfa_sessions (session_key,user_id,factor_version,verified_at,device_id)
      VALUES (?,?,?,UTC_TIMESTAMP(3),?) ON DUPLICATE KEY UPDATE factor_version=VALUES(factor_version),verified_at=VALUES(verified_at),device_id=VALUES(device_id)`, [req.sessionSecurity.key, req.user.id, row.factor_version, deviceId]);
    return { recoveryCodes, deviceToken, rememberDays: days, mirror: await recordSecurityAction(db, req, enroll ? 'mfa_enabled' : 'mfa_verified', { recoveryCode: isRecovery, rememberedDevice: !!deviceId }) };
  });
}

export async function forgetDevice(req, deviceId) {
  requireAccountSession(req);
  return transaction(async db => {
    const [result] = await db.execute('UPDATE account_mfa_devices SET revoked_at=UTC_TIMESTAMP(3) WHERE id=? AND user_id=? AND revoked_at IS NULL', [deviceId, req.user.id]);
    await db.execute('DELETE FROM account_mfa_sessions WHERE device_id=? AND user_id=?', [deviceId, req.user.id]);
    return { forgotten: result.affectedRows > 0, mirror: await recordSecurityAction(db, req, 'mfa_device_forgotten', { deviceId }) };
  });
}
