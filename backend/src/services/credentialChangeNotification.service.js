import crypto from 'node:crypto';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import OrganizationAffiliation from '../models/OrganizationAffiliation.model.js';
import AgencySchool from '../models/AgencySchool.model.js';
import { resolveSecurityMailbox } from './securityMailbox.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { buildPublicPortalLoginUrl } from '../utils/publicPortalUrl.js';

const email = value => String(value || '').trim().toLowerCase();
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export function credentialNoticeRecipient(user) {
  // Group aliases are login identifiers. Use the person's recovery inbox first.
  return [user.personal_email, user.work_email, user.email].map(email).find(value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) || null;
}

async function notificationAgency(userId, agencyId) {
  const agencies = await User.getAgencies(userId, { includeInactive: true });
  let agency = agencies.find(row => Number(row.id) === Number(agencyId)) || agencies.find(row => row.is_primary) || agencies[0];
  if (agency && ['school','program','learning'].includes(agency.organization_type)) {
    const parentId = await OrganizationAffiliation.getActiveAgencyIdForOrganization(agency.id) || await AgencySchool.getActiveAgencyIdForSchool(agency.id);
    agency = parentId ? await Agency.findById(parentId) : null;
  }
  if (!agency) throw new Error('No tenant is configured for this security notification');
  return agency;
}

export function buildCredentialChangeMessage({ kind, agency, replyTo, occurredAt, loginUrl }) {
  const credential = kind === 'quick_view' ? 'Quick View six-digit passcode' : 'account password';
  const title = `Your ${credential} was changed`;
  const when = new Date(occurredAt).toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'long', timeStyle: 'short' }) + ' UTC';
  const subject = `${agency.name} security alert: ${credential} changed`;
  const reportUrl = `mailto:${replyTo}?subject=${encodeURIComponent(`I did not change my ${credential}`)}`;
  const recovery = kind === 'quick_view' ? 'Reset your Quick View code in My Account → Accounts & access.' : 'Use Change Password in your account’s Security section.';
  const steps = `Contact ${replyTo} immediately by replying to this email or choosing Report this change. Open your usual ${agency.name} sign-in page. ${recovery} Ask your administrator to end other active sessions. If you use Google sign-in, also review your Google account security. Do not share passwords or passcodes by email.`;
  const text = `${title}\n\nA change to your ${credential} was completed on ${when}.\n\nIf you made this change, no action is needed.\n\nIf this was not you\n${steps}\n\nReport this change: ${reportUrl}\nSign in: ${loginUrl}\n\nYour new password or passcode is never included in this notice. This is a required account security notification.`;
  const color = /^#[\da-f]{6}$/i.test(agency.primary_color || '') ? agency.primary_color : '#245b43';
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;line-height:1.65"><p style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:${color};font-weight:700">${esc(agency.name)} · Account security</p><h1 style="font-size:26px;line-height:1.25">${esc(title)}</h1><p>A change to your ${esc(credential)} was completed on <strong>${esc(when)}</strong>.</p><p>If you made this change, no action is needed.</p><div style="padding:18px;background:#f8fafc;border:1px solid #dbe3eb;border-radius:10px"><h2 style="font-size:19px;margin:0 0 10px">If this was not you</h2><p>${esc(steps)}</p><p><a href="${esc(reportUrl)}" style="display:inline-block;background:${color};color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">Report this change</a></p><p><a href="${esc(loginUrl)}">Open your sign-in page</a></p></div><p style="font-size:12px;color:#64748b">Your new password or passcode is never included in this notice. This is a required account security notification.</p></div>`;
  return { subject, text, html };
}

export async function queueCredentialChangeNotice({ userId, agencyId = null, kind }) {
  if (!['password','quick_view'].includes(kind)) throw new Error('Unknown credential change');
  const user = await User.findById(userId);
  if (!user) throw new Error('Account not found for security notification');
  const to = credentialNoticeRecipient(user);
  if (!to) throw new Error('No delivery address for security notification');
  const agency = await notificationAgency(userId, agencyId);
  // Each completed mutation gets an event, including concurrent resets.
  // Retries deliver this same row; they never enqueue another event.
  const key = `${kind}:${userId}:${crypto.randomUUID()}`;
  const [result] = await pool.execute(`INSERT INTO credential_change_notifications (event_key,user_id,agency_id,credential_kind,recipient_email)
    VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`, [key,userId,agency.id,kind,to]);
  // Durable row comes first. A background retry survives request/process failure.
  setImmediate(() => deliverCredentialChangeNotice(result.insertId).catch(error => console.warn('[credential notice]', error?.code || 'delivery_failed')));
  return result.insertId;
}

export async function recordCredentialChangeNotice(event) {
  try { return await queueCredentialChangeNotice(event); }
  catch (error) {
    // A successful credential change must never be reported as a failed reset.
    console.error('[credential notice] queue failed', { userId: event.userId, kind: event.kind, error: error?.code || error?.message });
    return null;
  }
}

export async function deliverCredentialChangeNotice(id) {
  const db = await pool.getConnection();
  const lock = `credential_notice:${id}`;
  let acquired = false;
  try {
    const [[row]] = await db.execute('SELECT GET_LOCK(?,0) AS acquired', [lock]);
    acquired = Number(row?.acquired) === 1;
    if (!acquired) return;
    const [[job]] = await db.execute("SELECT * FROM credential_change_notifications WHERE id=? AND delivery_status='pending' AND next_attempt_at<=UTC_TIMESTAMP()", [id]);
    if (!job) return;
    try {
      const { agency, identity, replyTo } = await resolveSecurityMailbox(job.agency_id);
      const message = buildCredentialChangeMessage({ kind: job.credential_kind, agency, replyTo, occurredAt: job.occurred_at, loginUrl: buildPublicPortalLoginUrl(agency) });
      const result = await sendEmailFromIdentity({ ...message, senderIdentityId: identity.id, to: job.recipient_email, userId: job.user_id, source: 'manual', replyToOverride: replyTo, templateType: job.credential_kind === 'quick_view' ? 'security_quick_view_changed' : 'security_password_changed', internetMessageIdOverride: `<credential-notice-${id}@${identity.from_email.split('@')[1]}>` });
      if (!result?.id || result.queued || result.pendingApproval || result.skipped || result.blocked || result.redirected) throw new Error('Security email was not sent');
      await db.execute("UPDATE credential_change_notifications SET delivery_status='sent',sent_at=UTC_TIMESTAMP(),attempts=attempts+1,last_error=NULL WHERE id=?", [id]);
    } catch (error) {
      await db.execute("UPDATE credential_change_notifications SET attempts=attempts+1,last_error=?,next_attempt_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 MINUTE) WHERE id=?", [String(error?.code || error?.message || 'delivery_failed').slice(0,500),id]);
    }
  } finally {
    if (acquired) await db.execute('SELECT RELEASE_LOCK(?)', [lock]).catch(() => {});
    db.release();
  }
}

export async function processCredentialChangeNotices() {
  const [rows] = await pool.execute("SELECT id FROM credential_change_notifications WHERE delivery_status='pending' AND next_attempt_at<=UTC_TIMESTAMP() ORDER BY id LIMIT 20");
  for (const row of rows) await deliverCredentialChangeNotice(row.id);
}
