import crypto from 'node:crypto';
import pool from '../config/database.js';
import { dateToMysqlUtcDateTime, utcMysqlToIso } from '../utils/zonedWallTime.util.js';
import { escapePortalHtml as e } from './portalEmailBranding.service.js';

const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const emailHash = value => hash(String(value || '').trim().toLowerCase());
const fail = (message, status = 410) => Object.assign(new Error(message), { status });
export const SCHOOL_EMAIL_TEMPLATE = 'school_session_notice';

// Delivery address is intentional: guardians and affiliated contacts can each stop
// their own notices without changing another person's preferences or all siblings.
export function schoolSessionEmailScope({ agencyId, clientId, practiceId, patientId, to }) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to || '').trim())) throw fail('A recipient is required.', 400);
  const native = !!practiceId;
  if (native ? !patientId : !Number.isSafeInteger(Number(agencyId)) || Number(agencyId) < 1 || !Number.isSafeInteger(Number(clientId)) || Number(clientId) < 1) throw fail('A child and agency are required.', 400);
  const scope = { product: native ? 'auricwell' : 'guardian', agencyId: Number(agencyId) || null,
    clientId: native ? null : Number(clientId), practiceId: native ? String(practiceId) : null,
    patientId: native ? String(patientId) : null, recipientHash: emailHash(to) };
  return { ...scope, key: hash(JSON.stringify(['school_session', 'email', scope])) };
}

export async function isSchoolSessionEmailOptedOut(input, db = pool) {
  const scope = schoolSessionEmailScope(input);
  const [[row]] = await db.execute('SELECT disabled_at FROM school_session_email_preferences WHERE scope_key=?', [scope.key]);
  return !!row?.disabled_at;
}

export async function createSchoolSessionEmailOptOutLink(input, db = pool) {
  const scope = schoolSessionEmailScope(input);
  await db.execute(`INSERT IGNORE INTO school_session_email_preferences
    (scope_key,product,agency_id,client_id,practice_id,patient_id,recipient_hash) VALUES (?,?,?,?,?,?,?)`,
  [scope.key, scope.product, scope.agencyId, scope.clientId, scope.practiceId, scope.patientId, scope.recipientHash]);
  const token = crypto.randomBytes(32).toString('hex');
  await db.execute('INSERT INTO school_session_email_opt_out_tokens(token_hash,scope_key,expires_at) VALUES (?,?,?)',
    [hash(token), scope.key, dateToMysqlUtcDateTime(new Date(Date.now() + 180 * 86400000))]);
  return { scopeKey: scope.key, url: `https://auricwell.com/api/public/school-session-emails/${token}` };
}

export function schoolSessionEmailOptOutContent(url) {
  const label = 'Stop in-school session emails for this child';
  const detail = 'This affects only school session notices for this child, from this agency, sent to your email address. Other children, other recipients, office appointments, texts, billing and secure-message emails are unchanged.';
  return { text: `\n\n${label}:\n${url}\n${detail}`,
    html: `<p style="font-size:13px;margin-top:28px"><a href="${e(url)}">${label}</a><br>${e(detail)}</p>` };
}

// A token only grants the ability to stop one category of mail. No account login,
// chart access, patient names, or wider notification controls are exposed here.
export async function schoolSessionEmailOptOutContext(token, db = pool) {
  if (!/^[a-f0-9]{64}$/.test(String(token))) throw fail('This notification link is invalid.', 404);
  const [[row]] = await db.execute(`SELECT p.*,t.expires_at FROM school_session_email_opt_out_tokens t
    JOIN school_session_email_preferences p ON p.scope_key=t.scope_key WHERE t.token_hash=?`, [hash(token)]);
  const expiry = row?.expires_at instanceof Date ? row.expires_at : new Date(utcMysqlToIso(row?.expires_at));
  if (!row || !Number.isFinite(+expiry) || +expiry <= Date.now()) throw fail('This notification link has expired. Please use a recent school session email.');
  return row;
}

export async function disableSchoolSessionEmails(token, db = pool) {
  const row = await schoolSessionEmailOptOutContext(token, db);
  await db.execute('UPDATE school_session_email_preferences SET disabled_at=COALESCE(disabled_at,UTC_TIMESTAMP()) WHERE scope_key=?', [row.scope_key]);
  return { disabled: true };
}

// Approval retries use the original persisted scope, then re-check the preference
// immediately before transport. Never trust a client ID supplied by a public URL.
export async function schoolSessionEmailDeliveryGate({ templateType, schoolSessionScopeKey, existingCommunicationId, to, agencyId, clientId }, db = pool) {
  if (templateType !== SCHOOL_EMAIL_TEMPLATE) return { allowed: true };
  let key = schoolSessionScopeKey;
  if (existingCommunicationId) {
    const [[communication]] = await db.execute('SELECT metadata FROM user_communications WHERE id=?', [existingCommunicationId]);
    const meta = typeof communication?.metadata === 'string' ? JSON.parse(communication.metadata) : communication?.metadata;
    key = meta?.schoolSessionScopeKey;
  }
  if (!/^[a-f0-9]{64}$/.test(String(key))) throw fail('The school notification scope is missing.', 409);
  const [[row]] = await db.execute('SELECT * FROM school_session_email_preferences WHERE scope_key=?', [key]);
  if (!row || row.recipient_hash !== emailHash(to) || Number(row.agency_id) !== Number(agencyId) || (row.product === 'guardian' && Number(row.client_id) !== Number(clientId))) throw fail('The school notification recipient does not match its scope.', 409);
  return { allowed: !row.disabled_at, reason: row.disabled_at ? 'school_session_email_opted_out' : null };
}
