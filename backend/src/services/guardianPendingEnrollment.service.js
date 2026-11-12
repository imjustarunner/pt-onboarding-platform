import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import config from '../config/config.js';
import pool from '../config/database.js';
import { guardianCanReadIntakeDocuments } from '../utils/guardianDocumentAccess.js';
import { isDobAdultLocked } from '../utils/guardianWaivers.utils.js';
import { decryptIntakeSubmissionRow } from './intakeResponsesEncryption.service.js';

const purpose = 'guardian-portal-enrollment-v1';
const fail = () => Object.assign(new Error('This enrollment invitation is not available on your account.'), { status: 403, statusCode: 403 });
const signingKey = () => crypto.createHmac('sha256', config.jwt.secret).update(purpose).digest();

async function ownInvites({ userId, agencyId, clientId = null, inviteId = null, includeAccepted = false }, db = pool) {
  if (!Number(userId) || !Number(agencyId)) throw fail();
  const [rows] = await db.execute(`SELECT i.id, i.agency_id, i.status, i.expires_at, i.public_key, i.source, i.invited_email,
      ic.client_id, c.agency_id AS client_agency_id, c.client_type, c.full_name, c.initials, c.date_of_birth, c.guardian_portal_enabled,
      cg.access_enabled, cg.permissions_json
    FROM co_guardian_invites i
    JOIN users u ON u.id=? AND CONVERT(LOWER(TRIM(u.email)) USING utf8mb4) COLLATE utf8mb4_bin=CONVERT(LOWER(TRIM(i.invited_email)) USING utf8mb4) COLLATE utf8mb4_bin
      AND u.role IN ('client_guardian','client') AND u.is_active=1 AND UPPER(COALESCE(u.status,'')) NOT IN ('ARCHIVED','TERMINATED','SUSPENDED','INACTIVE')
    JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=i.agency_id AND ua.is_active=1
    JOIN co_guardian_invite_clients ic ON ic.invite_id=i.id
    LEFT JOIN clients c ON c.id=ic.client_id
    LEFT JOIN client_guardians cg ON cg.client_id=c.id AND cg.guardian_user_id=u.id
    WHERE i.agency_id=? AND (i.status IN ('pending','expired') OR (?=1 AND i.status='accepted' AND i.accepted_user_id=u.id))
      AND (? IS NULL OR i.id=?)
      AND (? IS NULL OR EXISTS (SELECT 1 FROM co_guardian_invite_clients selected WHERE selected.invite_id=i.id AND selected.client_id=?))
    ORDER BY i.id DESC, c.id`, [Number(userId), Number(agencyId), includeAccepted ? 1 : 0, inviteId, inviteId, clientId, clientId]);
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(Number(row.id))) grouped.set(Number(row.id), []);
    grouped.get(Number(row.id)).push(row);
  }
  return [...grouped.values()].filter(group => group.length && group.every(row => {
    if (Number(row.client_agency_id) !== Number(row.agency_id) || !['school','clinical'].includes(row.client_type)) return false;
    if (Number(row.access_enabled) !== 1 || Number(row.guardian_portal_enabled) !== 1 || isDobAdultLocked(row.date_of_birth)) return false;
    let permissions = row.permissions_json || {};
    if (typeof permissions === 'string') { try { permissions = JSON.parse(permissions); } catch { return false; } }
    // Invited guardians are deliberately unable to read the first parent's
    // documents. The recorded invitation still permits their OWN enrollment.
    if (row.status === 'pending' && permissions.isolatedIntake === true && permissions.coGuardianInviteRestricted === true
      && Number(permissions.coGuardianInviteId) === Number(row.id)) return true;
    return guardianCanReadIntakeDocuments(row) && permissions.canSignDocs !== false;
  }));
}

export async function listOwnPendingEnrollments(scope, db = pool) {
  return (await ownInvites(scope, db)).map(group => ({
    id: Number(group[0].id), agencyId: Number(group[0].agency_id),
    expired: group[0].status === 'expired' || new Date(group[0].expires_at).getTime() <= Date.now(),
    children: group.map(row => ({ id: Number(row.client_id), name: row.full_name || row.initials || 'Dependent' }))
  }));
}

export async function openOwnPendingEnrollment(scope, db = pool) {
  const group = (await ownInvites(scope, db)).find(rows => Number(rows[0].id) === Number(scope.inviteId));
  const invite = group?.[0];
  if (!invite || invite.status !== 'pending' || !(new Date(invite.expires_at).getTime() > Date.now())) throw fail();
  // A separate purpose-derived key prevents this capability from acting as a
  // login token. Opening the portal does not rotate or invalidate the email link.
  const token = jwt.sign({ userId: Number(scope.userId), agencyId: Number(scope.agencyId), inviteId: Number(scope.inviteId) }, signingKey(),
    { algorithm: 'HS256', issuer: purpose, audience: purpose, expiresIn: '1h' });
  const sessionToken = await ownSavedEnrollmentSession(scope, invite, db);
  return { token: `portal.${token}`, invite, sessionToken };
}

async function ownSavedEnrollmentSession(scope, invite, db) {
  const [drafts] = await db.execute(`SELECT s.*,l.public_key FROM intake_submissions s
    JOIN intake_links l ON l.id=s.intake_link_id
    WHERE s.co_guardian_invite_id=? AND l.public_key=?
      AND (s.guardian_user_id IS NULL OR s.guardian_user_id=?)
      AND s.status IN ('started','consented') AND s.submitted_at IS NULL
      AND s.session_token IS NOT NULL AND s.session_token<>''
    ORDER BY s.updated_at DESC,s.id DESC LIMIT 5`, [Number(invite.id), invite.public_key, Number(scope.userId)]);
  const email = value => String(value || '').trim().toLowerCase();
  for (const encrypted of drafts) {
    if (Number(encrypted.co_guardian_invite_id) !== Number(invite.id)
      || encrypted.public_key !== invite.public_key || !['started','consented'].includes(encrypted.status)
      || encrypted.submitted_at || !encrypted.session_token) continue;
    const expiries = [encrypted.draft_expires_at, encrypted.retention_expires_at].filter(Boolean).map(value=>new Date(value).getTime());
    // Opening the portal does not extend a declined reminder/retention window.
    if (!expiries.length || expiries.some(value=>!Number.isFinite(value)||value<=Date.now())) continue;
    let row, data;
    try {
      row = decryptIntakeSubmissionRow(encrypted);
      data = typeof row.intake_data === 'string' ? JSON.parse(row.intake_data) : row.intake_data;
    } catch {
      throw Object.assign(new Error('Your saved enrollment could not be restored. Contact your care team before starting again.'), {status:409,statusCode:409});
    }
    const ownerId = Number(row.guardian_user_id || data?.guardianSubmission?.guardianUserId || data?.portalEnrollment?.userId || 0);
    const savedEmail = email(data?.guardian?.email || data?.progressSnapshot?.guardian?.email || row.signer_email);
    if (ownerId && ownerId !== Number(scope.userId)) continue;
    if (data?.guardianSubmission?.inviteId && Number(data.guardianSubmission.inviteId) !== Number(invite.id)) continue;
    if (ownerId === Number(scope.userId) || (savedEmail && savedEmail === email(invite.invited_email))) return row.session_token;
  }
  return null;
}

export async function resolvePortalEnrollmentCapability(token, db = pool) {
  try {
    const claims = jwt.verify(String(token).slice('portal.'.length), signingKey(), { algorithms: ['HS256'], issuer: purpose, audience: purpose });
    const groups = await ownInvites({ userId: claims.userId, agencyId: claims.agencyId, inviteId: claims.inviteId, includeAccepted: true }, db);
    if (!groups.some(group => Number(group[0].id) === Number(claims.inviteId))) throw fail();
    const [rows] = await db.execute('SELECT * FROM co_guardian_invites WHERE id=? AND agency_id=? LIMIT 1', [claims.inviteId, claims.agencyId]);
    if (!rows[0] || !['pending','accepted'].includes(rows[0].status) || (rows[0].status === 'accepted' && Number(rows[0].accepted_user_id) !== Number(claims.userId)) || !(new Date(rows[0].expires_at).getTime() > Date.now())) throw fail();
    return rows[0];
  } catch { throw fail(); }
}
