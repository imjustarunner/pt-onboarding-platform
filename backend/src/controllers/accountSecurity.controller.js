import pool from '../config/database.js';
import config from '../config/config.js';
import { accountSecurityState, beginAuthenticator, verifyAuthenticator, forgetDevice, requireAccountSession, DEVICE_COOKIE } from '../services/accountSecurity.service.js';
import { personalSessions } from '../services/personalSessionHistory.service.js';
import { appendSecurityEvidence, mirrorSecurityEvidence } from '../services/securityEvidence.service.js';
import { sessionReference } from '../utils/securityEvidence.js';
import { isPrivacyReviewer } from './activityProtection.controller.js';
import { securityError } from '../utils/accountSecurity.js';
import { sendSchoolEmailCode, verifySchoolEmailCode } from '../services/schoolEmailVerification.service.js';

const handle = fn => async (req, res, next) => {
  try { requireAccountSession(req); res.setHeader('Cache-Control', 'no-store'); await fn(req, res); }
  catch (error) { if (error.code?.startsWith('MFA_') || ['PRIMARY_VERIFICATION_REQUIRED','ACCOUNT_SESSION_REQUIRED'].includes(error.code)) return res.status(error.status || 400).json({ error: { code: error.code, message: error.message } }); next(error); }
};
export const status = handle(async (req, res) => {
  const state = await accountSecurityState(req);
  const [devices] = await pool.execute('SELECT id,label,user_agent,created_at,expires_at FROM account_mfa_devices WHERE user_id=? AND revoked_at IS NULL AND expires_at>UTC_TIMESTAMP(3) ORDER BY created_at DESC LIMIT 100', [req.user.id]);
  res.json({ ...state, devices, canReviewPrivacy: await isPrivacyReviewer(req.user.id) });
});
export const begin = handle(async (req, res) => res.json(await beginAuthenticator(req)));
export const sendEmailCode = handle(async (req, res) => res.json(await sendSchoolEmailCode(req)));
export const verifyEmailCode = handle(async (req, res) => {
  await verifySchoolEmailCode(req);
  res.json({ verified: true });
});
function verify(enroll) { return handle(async (req, res) => {
  const result = await verifyAuthenticator(req, enroll);
  if (result.deviceToken) res.cookie(DEVICE_COOKIE, result.deviceToken, { ...config.authCookie.set(), maxAge: result.rememberDays * 86400000 });
  res.json({ verified: true, recoveryCodes: result.recoveryCodes, remembered: !!result.deviceToken });
}); }
export const confirm = verify(true);
export const challenge = verify(false);
export const reset = handle(async (req, res) => {
  if (req.body?.confirmReset !== true) throw securityError('MFA_CONFIRM_RESET', 'Confirm that you want to replace your authenticator.');
  await verifyAuthenticator(req, false, true);
  res.clearCookie(DEVICE_COOKIE, config.authCookie.clear());
  res.clearCookie('authToken', config.authCookie.clear());
  res.json({ reset: true, message: 'Your sessions have ended. Sign in again and set up your new authenticator before opening protected information.' });
});
export const forget = handle(async (req, res) => { const result = await forgetDevice(req, req.params.deviceId); res.json({ forgotten: result.forgotten }); });
export const sessions = handle(async (req, res) => res.json(await personalSessions(req.user, req.query.page)));
export const sessionEvents = handle(async (req, res) => {
  const reference = String(req.params.reference || '');
  if (!/^[a-f0-9]{64}$/.test(reference)) throw securityError('INVALID_SESSION', 'Invalid session reference.');
  const before = /^\d{1,20}$/.test(String(req.query.before || '')) ? String(req.query.before) : null;
  const [rows] = await pool.execute(`SELECT id,occurred_at,phase,action,outcome,method,route,status_code,response_bytes,client_ip,ip_source,JSON_EXTRACT(details,'$.transfer') transfer
    FROM security_evidence WHERE user_id=? AND session_ref=? ${before ? 'AND id<?' : ''} ORDER BY id DESC LIMIT 101`, [req.user.id, reference, ...(before ? [before] : [])]);
  res.json({ items: rows.slice(0, 100), nextCursor: rows.length > 100 ? String(rows[99].id) : null,
    notice: 'Only recorded activity is shown. Closing a browser may not send a logout. Older sessions may have no detailed evidence.' });
});
export const endSession = handle(async (req, res) => {
  const reference = String(req.params.reference || '');
  if (!/^[a-f0-9]{64}$/.test(reference)) throw securityError('INVALID_SESSION', 'Invalid session reference.');
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [result] = await db.execute("UPDATE auth_session_security SET revoked_at=UTC_TIMESTAMP(3),end_reason='Ended by account owner' WHERE user_id=? AND session_ref=? AND revoked_at IS NULL", [req.user.id, reference]);
    const event = { ...req.evidenceContext, userId: req.user.id, email: req.user.email, role: req.user.role, sessionRef: sessionReference(req.user.sessionId), phase: 'administrative_action', action: 'session_revoked', outcome: result.affectedRows > 0 ? 'succeeded' : 'no_change', details: { targetSessionReference: reference, ended: result.affectedRows > 0 } };
    const id = await appendSecurityEvidence(event, db, { mirror: false });
    await db.commit(); mirrorSecurityEvidence(event, id);
    res.json({ ended: result.affectedRows > 0, current: reference === sessionReference(req.user.sessionId) });
  } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
});
