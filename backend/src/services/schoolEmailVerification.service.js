import crypto from 'node:crypto';
import pool from '../config/database.js';
import { requireAccountSession } from './accountSecurity.service.js';
import { hashSecurityToken, securityError } from '../utils/accountSecurity.js';
import { appendSecurityEvidence, mirrorSecurityEvidence } from './securityEvidence.service.js';
import { sessionReference } from '../utils/securityEvidence.js';

const normalizedEmail = value => String(value || '').trim().toLowerCase();
export const schoolEmailHash = value => hashSecurityToken(normalizedEmail(value));
export function maskedSchoolEmail(value) {
  const [name, domain] = normalizedEmail(value).split('@');
  return domain ? `${name.slice(0, 1)}•••@${domain}` : null;
}
function codeHash(id, code) {
  const key = Buffer.from(process.env.MFA_ENCRYPTION_KEY_BASE64 || '', 'base64');
  if (key.length !== 32) throw securityError('MFA_UNAVAILABLE', 'Verification is temporarily unavailable.', 503);
  return crypto.createHmac('sha256', key).update(`school-email:${id}:${code}`).digest('hex');
}
async function schoolUser(db, req) {
  const [[user]] = await db.execute('SELECT role,email FROM users WHERE id=? FOR UPDATE', [req.user.id]);
  if (user?.role !== 'school_staff') throw securityError('MFA_METHOD_NOT_ALLOWED', 'Use authenticator verification for this account.', 403);
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(user.email || '')) throw securityError('MFA_EMAIL_UNAVAILABLE', 'Contact IT to correct your school email address.', 409);
  return user;
}
async function record(db, req, action, outcome) {
  const event = { ...req.evidenceContext, userId: req.user.id, email: req.user.email, role: 'school_staff', sessionRef: sessionReference(req.user.sessionId), phase: 'administrative_action', action, outcome, details: { method: 'email' } };
  const id = await appendSecurityEvidence(event, db, { mirror: false });
  return () => mirrorSecurityEvidence(event, id);
}
async function transaction(work) {
  const db = await pool.getConnection();
  try { await db.beginTransaction(); const result = await work(db); await db.commit(); result?.mirror?.(); if (result?.error) throw result.error; return result; }
  catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
}
const limited = () => securityError('MFA_RATE_LIMITED', 'Too many attempts. Wait before requesting or entering another code.', 429);
async function deliver({ to, code }) {
  // Security codes bypass communication-body archives and must never be redirected
  // to a testing inbox. The transport still applies outbound abuse protection.
  const { default: Email } = await import('./googleWorkspaceEmail.service.js');
  await Email.sendEmail({ to, subject: 'Your school portal verification code', text: `Your verification code is ${code}. It expires in 10 minutes. Enter it only in the school portal you opened. Do not share it. If you did not request this code, contact your IT administrator.`, securityCode: true });
}
export async function sendSchoolEmailCode(req, send = deliver) {
  requireAccountSession(req);
  const id = crypto.randomUUID(), code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const result = await transaction(async db => {
    const user = await schoolUser(db, req); // Serializes sends, including the first insert.
    const [[previous]] = await db.execute('SELECT * FROM account_email_challenges WHERE user_id=? FOR UPDATE', [req.user.id]);
    const now = Date.now();
    if (previous?.locked_until && new Date(previous.locked_until).getTime() > now) throw limited();
    const sameWindow = previous && now - new Date(previous.window_started_at).getTime() < 3600000;
    if (previous && (now - new Date(previous.sent_at).getTime() < 60000 || (sameWindow && previous.send_count >= 5))) throw limited();
    const failures = previous?.locked_until ? 0 : Number(previous?.failed_attempts || 0);
    await db.execute(`INSERT INTO account_email_challenges (user_id,challenge_id,session_key,recipient_hash,code_hash,expires_at,sent_at,window_started_at,send_count,failed_attempts)
      VALUES (?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE challenge_id=VALUES(challenge_id),session_key=VALUES(session_key),recipient_hash=VALUES(recipient_hash),code_hash=VALUES(code_hash),expires_at=VALUES(expires_at),sent_at=VALUES(sent_at),window_started_at=VALUES(window_started_at),send_count=VALUES(send_count),failed_attempts=VALUES(failed_attempts),locked_until=NULL,delivery_state='pending'`,
    [req.user.id,id,req.sessionSecurity.key,schoolEmailHash(user.email),codeHash(id,code),new Date(now+600000),new Date(now),sameWindow ? previous.window_started_at : new Date(now),sameWindow ? previous.send_count+1 : 1,failures]);
    return { to: user.email, mirror: await record(db,req,'email_verification_requested','started') };
  });
  try { await send({ to: result.to, code }); }
  catch {
    await pool.execute("UPDATE account_email_challenges SET code_hash=NULL,delivery_state='failed' WHERE user_id=? AND challenge_id=?",[req.user.id,id]);
    throw securityError('MFA_EMAIL_DELIVERY_FAILED','The code could not be sent. Wait one minute and try again, or contact IT.',503);
  }
  await pool.execute("UPDATE account_email_challenges SET delivery_state='sent' WHERE user_id=? AND challenge_id=? AND code_hash IS NOT NULL",[req.user.id,id]);
  return { sent: true, maskedEmail: maskedSchoolEmail(result.to), expiresInSeconds: 600, resendAfterSeconds: 60 };
}
export async function verifySchoolEmailCode(req) {
  requireAccountSession(req);
  return transaction(async db => {
    const user = await schoolUser(db,req);
    const [[row]] = await db.execute('SELECT * FROM account_email_challenges WHERE user_id=? FOR UPDATE',[req.user.id]);
    const now = Date.now();
    if (row?.locked_until && new Date(row.locked_until).getTime()>now) throw limited();
    const matches = row?.code_hash && /^\d{6}$/.test(String(req.body?.code || '')) && crypto.timingSafeEqual(Buffer.from(row.code_hash,'hex'),Buffer.from(codeHash(row.challenge_id,req.body.code),'hex'));
    if (!row) throw securityError('MFA_INVALID_CODE','Request a new email code first.',422);
    if (!matches || row.delivery_state!=='sent' || row.session_key!==req.sessionSecurity.key || row.recipient_hash!==schoolEmailHash(user.email) || new Date(row.expires_at).getTime()<=now) {
      const attempts=Number(row.failed_attempts)+1;
      await db.execute('UPDATE account_email_challenges SET failed_attempts=?,locked_until=? WHERE user_id=?',[attempts,attempts>=5?new Date(now+900000):null,req.user.id]);
      return { error: attempts>=5?limited():securityError('MFA_INVALID_CODE','That code is incorrect, expired, or already used.',422), mirror: await record(db,req,'email_verification_failed','denied') };
    }
    await db.execute('UPDATE account_email_challenges SET code_hash=NULL,failed_attempts=0,locked_until=NULL WHERE user_id=?',[req.user.id]);
    await db.execute(`INSERT INTO account_email_sessions (session_key,user_id,recipient_hash,verified_at) VALUES (?,?,?,UTC_TIMESTAMP(3))
      ON DUPLICATE KEY UPDATE user_id=VALUES(user_id),recipient_hash=VALUES(recipient_hash),verified_at=VALUES(verified_at)`,[req.sessionSecurity.key,req.user.id,schoolEmailHash(user.email)]);
    return { verified:true, mirror:await record(db,req,'email_verified','succeeded') };
  });
}
