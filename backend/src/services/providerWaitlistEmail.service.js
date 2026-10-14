import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import { loadEnrollmentWaitlist } from './providerEnrollmentWaitlist.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const RETRY_MS = 60 * 60 * 1000;
export const DEFAULT_WAITLIST_EMAIL_POLICY = Object.freeze({ clientWeeks: Object.freeze([1, 2, 3]), alternativeProviderWeek: 3, staffAfterClientWeeks: true });
const email = value => {
  const address = String(value || '').trim().toLowerCase();
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(address) ? address : null;
};
const escapeHtml = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cycleKey = row => createHash('sha256').update(`${row.submissionId || 'manual'}:${new Date(row.joinedAt || row.requestedAt).toISOString()}`).digest('hex');

export function waitlistEmailWindow(row, { now = new Date(), policy = DEFAULT_WAITLIST_EMAIL_POLICY } = {}) {
  const added = new Date(row.joinedAt || row.requestedAt || '').getTime();
  if (!Number.isFinite(added)) return null;
  const week = Math.floor((new Date(now).getTime() - added) / WEEK_MS);
  if (week < 1) return null;
  const clientWeeks = (policy.clientWeeks || []).filter(n => Number.isInteger(n) && n > 0);
  const includeClient = clientWeeks.includes(week) && Boolean(email(row.contactEmail || row.contact?.email));
  if (!includeClient && !policy.staffAfterClientWeeks && !clientWeeks.includes(week)) return null;
  return { week, cycleKey: cycleKey(row), audience: includeClient ? 'client_and_staff' : 'staff', includeClient,
    discussAlternatives: week >= Number(policy.alternativeProviderWeek || 3) };
}

/** Require existing tenant addresses. The unified sender additionally verifies
 * the notifications From address against Gmail's accepted send-as identities. */
export async function resolveWaitlistMailboxes(database, agencyId) {
  const [rows] = await database.execute(`SELECT id, agency_id, identity_key, from_email, reply_to, inbound_addresses_json, is_active FROM email_sender_identities
    WHERE agency_id = ? AND is_active = 1`, [agencyId]);
  const valid = rows.filter(row => Number(row.agency_id) === Number(agencyId) && Number(row.is_active) === 1);
  const priority = row => ({ notifications: 0, default_notifications: 1 }[row.identity_key] ?? 2);
  const notifications = valid.filter(row => row.id && email(row.from_email)?.startsWith('notifications@'))
    .sort((a, b) => priority(a) - priority(b) || Number(a.id) - Number(b.id));
  const configured = new Set(valid.flatMap(row => {
    let inbound = row.inbound_addresses_json;
    if (typeof inbound === 'string') { try { inbound = JSON.parse(inbound); } catch { inbound = []; } }
    return [row.from_email, ...(Array.isArray(inbound) ? inbound : [])].map(email).filter(Boolean);
  }));
  let inboundRoutes;
  for (const identity of notifications) {
    const from = email(identity.from_email);
    const wantedSupport = `support@${from.split('@')[1]}`;
    if (!configured.has(wantedSupport) && email(identity.reply_to) !== wantedSupport) {
      if (!inboundRoutes) {
        const [routes] = await database.execute(`SELECT e.agency_id, e.is_active, r.email_address, r.is_active AS route_is_active
          FROM email_inbound_routes r JOIN email_sender_identities e ON e.id=r.sender_identity_id
          WHERE e.agency_id=? AND e.is_active=1 AND r.is_active=1`, [agencyId]);
        inboundRoutes = new Set(routes.filter(row => Number(row.agency_id) === Number(agencyId)
          && Number(row.is_active) === 1 && Number(row.route_is_active) === 1).map(row => email(row.email_address)).filter(Boolean));
      }
      if (!inboundRoutes.has(wantedSupport)) continue;
    }
    return { senderIdentityId: Number(identity.id), from, support: wantedSupport };
  }
  throw Object.assign(new Error('Configure this agency’s notifications and support mailboxes before sending waitlist updates.'), { code: 'WAITLIST_MAILBOX_NOT_CONFIGURED' });
}

export function buildProviderWaitlistEmail(row, window, mailboxes) {
  const providerName = String(row.providerName || 'your requested provider').replace(/[\r\n]+/g, ' ').trim();
  const agencyName = String(row.agencyName || 'Our team').replace(/[\r\n]+/g, ' ').trim();
  const paragraphs = window.includeClient ? [
    `Your request is still on ${providerName}’s waitlist with ${agencyName}.`,
    'Our support team and your requested provider are copied on this update and will follow up to coordinate care. Being on the waitlist does not guarantee placement or a particular appointment time.',
    `If your preferred days, times, or virtual/in-person setting have changed, reply to this email or contact ${mailboxes.support}. Please leave clinical details for a secure conversation.`,
    ...(window.discussAlternatives ? ['You have been waiting for at least three weeks. If you would like, our team can discuss additional providers and other scheduling options with you. You can keep your current preference while discussing alternatives.'] : []),
    `If you no longer need this request, contact ${mailboxes.support} so our team can update it.`
  ] : [
    `A provider-specific enrollment waitlist request is still awaiting care coordination with ${providerName}.`,
    `Client reference: #${Number(row.clientId || row.id)}.${row.submissionId ? ` Enrollment reference: #${Number(row.submissionId)}.` : ''} Waiting: ${window.week} week${window.week === 1 ? '' : 's'}.`,
    'Review the active request and coordinate next steps. This is a requested provider, not a confirmed clinical assignment.',
    ...(window.discussAlternatives ? ['Check whether the client would like to discuss additional providers or updated scheduling preferences. Do not remove the current preference merely because alternatives are being discussed.'] : []),
    window.week > Math.max(...DEFAULT_WAITLIST_EMAIL_POLICY.clientWeeks) ? 'The initial client email series has ended. Staff follow-up continues until this waitlist request is resolved.' : 'No client email address is available for this weekly update. Please use the verified contact information in the client record.',
    `Coordinate replies through ${mailboxes.support}.`
  ];
  const subject = window.includeClient ? `${agencyName}: your waitlist update` : `${agencyName}: provider waitlist follow-up`;
  const text = paragraphs.join('\n\n');
  return { subject, text, html: `<div style="font:15px/1.7 Arial,sans-serif">${paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('')}</div>` };
}

export function createProviderWaitlistEmailService({ database = pool, loadWaitlist = loadEnrollmentWaitlist, sendEmail = sendEmailFromIdentity } = {}) {
  async function deliver(job, { now, policy }) {
    const db = await database.getConnection();
    const lock = `provider-waitlist-email:${job.id}`;
    let locked = false, ready = false, sending = false;
    try {
      const [[acquired]] = await db.execute('SELECT GET_LOCK(?,0) acquired', [lock]);
      locked = Boolean(acquired?.acquired); if (!locked) return 'busy';
      const [[current]] = await db.execute('SELECT * FROM provider_waitlist_email_deliveries WHERE id=?', [job.id]);
      if (current?.delivery_status !== 'pending' || new Date(current.next_attempt_at).getTime() > now.getTime()) return 'duplicate';
      ready = true;
      const liveRows = await loadWaitlist({ agencyId: job.agency_id, providerId: job.provider_id, clientId: job.client_id }, database);
      const live = liveRows.find(row => cycleKey(row) === job.cycle_key);
      const window = live ? waitlistEmailWindow(live, { now, policy }) : null;
      if (!window || window.week !== Number(job.week_number)) {
        await db.execute("UPDATE provider_waitlist_email_deliveries SET delivery_status='obsolete' WHERE id=?", [job.id]);
        return 'obsolete';
      }
      const mailboxes = await resolveWaitlistMailboxes(database, job.agency_id);
      const providerEmail = email(live.providerEmail);
      if (!providerEmail) throw Object.assign(new Error('The requested provider has no configured email address.'), { code: 'WAITLIST_PROVIDER_EMAIL_MISSING' });
      const to = window.includeClient ? email(live.contactEmail || live.contact?.email) : mailboxes.support;
      const cc = [...new Set([...(window.includeClient ? [mailboxes.support] : []), providerEmail])].filter(address => address !== to);
      const content = buildProviderWaitlistEmail(live, window, mailboxes);
      const [claim] = await db.execute("UPDATE provider_waitlist_email_deliveries SET delivery_status='sending', audience=?, attempts=attempts+1 WHERE id=? AND delivery_status='pending'", [window.audience, job.id]);
      if (!claim.affectedRows) return 'duplicate';
      sending = true;
      const result = await sendEmail({ senderIdentityId: mailboxes.senderIdentityId, fromDisplayNameOverride: `${live.agencyName || 'Care coordination'} · Notifications`,
        replyToOverride: mailboxes.support, to, cc, ...content, source: 'auto', usedFallbackSender: false,
        clientId: job.client_id, intakeSubmissionId: job.submission_id || null, templateType: 'provider_waitlist_update',
        internetMessageIdOverride: `<waitlist-${job.id}@${mailboxes.from.split('@')[1]}>` });
      const status = result?.id && !result.redirected && !result.blocked && !result.skipped ? 'sent'
        : result?.pendingApproval || result?.queued ? 'queued' : 'held';
      await db.execute("UPDATE provider_waitlist_email_deliveries SET delivery_status=?, communication_id=?, sent_at=IF(?='sent',?,NULL), last_error=? WHERE id=?", [status, result?.communicationId || null, status, now, result?.reason || null, job.id]);
      return status;
    } catch (error) {
      // A transport timeout can occur after acceptance. Never auto-resend an
      // uncertain external delivery; staff can inspect the communications log.
      if (!ready) return 'retry';
      const status = sending ? 'review' : 'pending';
      await db.execute('UPDATE provider_waitlist_email_deliveries SET delivery_status=?, communication_id=COALESCE(?,communication_id), last_error=?, next_attempt_at=? WHERE id=?',
        [status, error.communicationId || null, String(error.code || 'waitlist_email_error').slice(0, 500), new Date(now.getTime() + RETRY_MS), job.id]);
      return sending ? 'review' : 'retry';
    } finally {
      try { if (locked) await db.execute('SELECT RELEASE_LOCK(?)', [lock]); }
      finally { db.release(); }
    }
  }

  async function run({ now = new Date(), policy = DEFAULT_WAITLIST_EMAIL_POLICY, limit = 100 } = {}) {
    now = new Date(now);
    const result = { scanned: 0, sent: 0, queued: 0, held: 0, review: 0, retry: 0, obsolete: 0, duplicate: 0, busy: 0 };
    let attempted = 0;
    const [agencies] = await database.execute(`SELECT DISTINCT c.agency_id FROM clients c JOIN agencies a ON a.id=c.agency_id
      WHERE JSON_EXTRACT(c.intake_preferences_json,'$.waitlist.active')=TRUE AND a.is_active=1 ORDER BY c.agency_id`);
    for (const agency of agencies) {
      const rows = await loadWaitlist({ agencyId: Number(agency.agency_id) }, database);
      for (const row of rows) {
        const window = waitlistEmailWindow(row, { now, policy });
        if (!window) continue;
        result.scanned++;
        await database.execute(`INSERT IGNORE INTO provider_waitlist_email_deliveries
          (agency_id,client_id,provider_id,submission_id,cycle_key,week_number,audience) VALUES (?,?,?,?,?,?,?)`,
          [row.agencyId, row.clientId || row.id, row.providerId, row.submissionId || null, window.cycleKey, window.week, window.audience]);
        const [[job]] = await database.execute(`SELECT * FROM provider_waitlist_email_deliveries
          WHERE agency_id=? AND client_id=? AND provider_id=? AND cycle_key=? AND week_number=?`,
          [row.agencyId, row.clientId || row.id, row.providerId, window.cycleKey, window.week]);
        if (!job) continue;
        // Already delivered or deferred rows must not consume the work budget;
        // otherwise the oldest clients would starve every later waitlist entry.
        if (job.delivery_status !== 'pending' || new Date(job.next_attempt_at).getTime() > now.getTime()) { result.duplicate++; continue; }
        if (attempted >= Math.max(1, Math.min(500, Number(limit) || 100))) return result;
        attempted++;
        const status = await deliver(job, { now, policy });
        result[status]++;
      }
    }
    return result;
  }
  return { run };
}

export const runProviderWaitlistEmailTick = options => createProviderWaitlistEmailService().run(options);
