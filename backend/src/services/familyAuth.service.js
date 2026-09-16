import crypto from 'crypto';
import bcrypt from 'bcrypt';
import pool from '../config/database.js';
import { familyEnabled, familyError } from './familyPolicy.js';

export const familyHash = value => crypto.createHash('sha256').update(String(value || '')).digest('hex');
export const familyCookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/family', maxAge: 400 * 86400000 };

export async function assertFamilyBenefit(userId, agencyId, db = pool) {
  const [rows] = await db.execute(`SELECT a.feature_flags FROM agencies a
    JOIN user_agencies ua ON ua.agency_id=a.id AND ua.user_id=?
    JOIN users u ON u.id=ua.user_id
    WHERE a.id=? AND a.is_active=1 AND COALESCE(ua.is_active,1)=1
    AND UPPER(COALESCE(u.status,'')) NOT IN ('INACTIVE','ARCHIVED','TERMINATED','DELETED') LIMIT 1`, [userId, agencyId]);
  if (!rows[0] || !familyEnabled(rows[0].feature_flags)) throw familyError('Family Command Center is not enabled for your organization.', 403);
}

export async function startFamilySession(userId, agencyId) {
  await assertFamilyBenefit(userId, agencyId);
  const [credentials] = await pool.execute('SELECT token_version,passcode_version FROM user_quick_view_credentials WHERE user_id=?', [userId]);
  const raw = crypto.randomBytes(32).toString('base64url');
  await pool.execute('INSERT INTO family_device_sessions (token_hash,user_id,agency_id,credential_version,passcode_version) VALUES (?,?,?,?,?)', [familyHash(raw), userId, agencyId, credentials[0]?.token_version || 0, credentials[0]?.passcode_version || 0]);
  return raw;
}

export async function unlockFamily({ agencyId, passcode, email }) {
  const aid = Number(agencyId) || null;
  if (!/^\d{6}$/.test(String(passcode || '')) || (aid !== null && (!Number.isSafeInteger(aid) || aid < 1))) throw familyError('Enter your six-digit code.');
  const [rows] = await pool.execute(`SELECT DISTINCT c.*, u.email, u.status, ua.agency_id AS benefit_agency_id, ua.is_primary,
    EXISTS(SELECT 1 FROM family_members fm JOIN family_households fh ON fh.id=fm.household_id WHERE fm.user_id=c.user_id AND fh.agency_id=ua.agency_id) AS has_household
    FROM user_quick_view_credentials c
    JOIN users u ON u.id=c.user_id JOIN user_agencies ua ON ua.user_id=c.user_id
    JOIN agencies a ON a.id=ua.agency_id
    WHERE COALESCE(ua.is_active,1)=1 AND a.is_active=1
    AND JSON_UNQUOTE(JSON_EXTRACT(a.feature_flags,'$.familyCommandCenterEnabled')) IN ('true','1')
    ${aid ? 'AND ua.agency_id=?' : ''}
    AND c.passcode_hash IS NOT NULL
    AND UPPER(COALESCE(u.status,'')) NOT IN ('INACTIVE','ARCHIVED','TERMINATED','DELETED')
    ${email ? 'AND LOWER(u.email)=?' : ''} ORDER BY has_household DESC,ua.is_primary DESC,ua.agency_id LIMIT 501`, [...(aid ? [aid] : []), ...(email ? [String(email).trim().toLowerCase()] : [])]);
  if (rows.length > 500) throw familyError('Enter your account email as well as your code.');
  const matches = [];
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.user_id)) continue;
    seen.add(row.user_id);
    if (await bcrypt.compare(String(passcode), row.passcode_hash)) matches.push(row);
  }
  if (matches.length > 1) throw familyError('More than one account uses that code. Enter your account email too.', 409);
  const user = matches[0];
  if (!user || Number(user.failed_passcode_attempts) >= 3 || (user.passcode_locked_until && new Date(user.passcode_locked_until) > new Date())) throw familyError('Code not accepted. You can reset it in your account’s Privacy & Quick View settings.', 401);
  return startFamilySession(user.user_id, aid || user.benefit_agency_id);
}

export async function requireFamilySession(req, res, next) {
  try {
    const raw = req.cookies?.fcc_session;
    if (!raw) throw familyError('Sign in to your family dashboard.', 401);
    const [rows] = await pool.execute(`SELECT s.*, COALESCE(c.token_version,0) AS current_version, COALESCE(c.passcode_version,0) AS current_passcode_version
      FROM family_device_sessions s LEFT JOIN user_quick_view_credentials c ON c.user_id=s.user_id
      WHERE s.token_hash=? AND s.revoked_at IS NULL`, [familyHash(raw)]);
    const session = rows[0];
    if (!session || Number(session.credential_version) !== Number(session.current_version) || Number(session.passcode_version) !== Number(session.current_passcode_version)) throw familyError('Sign in to your family dashboard.', 401);
    await assertFamilyBenefit(session.user_id, session.agency_id);
    req.family = { userId: session.user_id, agencyId: session.agency_id };
    await pool.execute('UPDATE family_device_sessions SET last_used_at=NOW() WHERE token_hash=?', [familyHash(raw)]);
    res.cookie('fcc_session', raw, familyCookieOptions);
    next();
  } catch (error) { next(error); }
}

export async function requireHousehold(session, householdId, db = pool, parent = false) {
  const [rows] = await db.execute(`SELECT h.*, m.role FROM family_households h JOIN family_members m ON m.household_id=h.id
    WHERE h.id=? AND h.agency_id=? AND m.user_id=?`, [Number(householdId) || 0, session.agencyId, session.userId]);
  if (!rows[0]) throw familyError('Household not found.', 404);
  if (parent && rows[0].role !== 'parent') throw familyError('A parent needs to make this change.', 403);
  return rows[0];
}
