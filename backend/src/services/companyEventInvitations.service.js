import { randomBytes } from 'node:crypto';
import pool from '../config/database.js';
import Notification from '../models/Notification.model.js';
import { readEventOperations } from '../utils/companyEventOperations.js';
import { companyEventInvitationEmail } from '../utils/companyEventInvitationEmail.js';
import { invitationResponse } from '../utils/companyEventReminders.js';
import { publicUploadsUrlFromStoredPath } from '../utils/uploads.js';
import { sendCompanyEventSms } from './companyEventSms.service.js';

const error = (code, message) => Object.assign(new Error(message), { code, status: 400 });
const baseUrl = () => String(process.env.FRONTEND_URL || process.env.FRONTEND_BASE_URL || '').replace(/\/$/, '');
export function companyEventInvitationLinks(event, token) {
  const base = baseUrl();
  if (!/^https?:\/\//i.test(base)) throw error('event_url_unconfigured', 'Configure the application URL before sending event invitations.');
  const operations = readEventOperations(event);
  const staffToken = event.staff_link_token || event.staffLinkToken;
  const rsvpUrl = `${base}/event-rsvp/${encodeURIComponent(token)}`;
  const privateUrl = staffToken ? `${base}/company-events/${Number(event.id)}/staff/${staffToken}` : rsvpUrl;
  return { rsvpUrl, detailsUrl: privateUrl, smsUrl: operations.publicRegistrationEnabled ? `${base}/company-events/${Number(event.id)}` : privateUrl };
}

export async function companyEventEmailContext(event, db = pool) {
  const operations = readEventOperations(event), owner = Number(event.agency_id || event.agencyId);
  const ids = [...new Set([owner, ...(operations.invitedAgencyIds || [])].map(Number).filter(Boolean))];
  const [agencyRows] = await db.execute(`SELECT id, name, slug, logo_url, logo_path, feature_flags FROM agencies WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY id`, ids);
  const agencies = agencyRows.map(agency => {
    const raw = String(agency.logo_url || agency.logo_path || '').trim();
    const logoUrl = /^https?:\/\//i.test(raw) ? raw : raw.startsWith('/logos/') || raw.startsWith('/assets/')
      ? `${baseUrl()}${raw}` : publicUploadsUrlFromStoredPath(raw);
    return { ...agency, ...(logoUrl ? { logoUrl } : {}) };
  });
  const multi = ids.length > 1;
  let senderAgencyId = owner;
  if (multi) {
    const [parent] = await db.execute("SELECT id FROM agencies WHERE slug = 'plottwistco' AND is_active = 1 LIMIT 1");
    if (!parent[0]) throw error('event_parent_sender_missing', 'Configure PlotTwistCo event email for invitations spanning agencies.');
    senderAgencyId = Number(parent[0].id);
  }
  const [identities] = await db.execute(`SELECT id, from_email, display_name FROM email_sender_identities
    WHERE agency_id = ? AND identity_key = 'events' AND is_active = 1 LIMIT 1`, [senderAgencyId]);
  const identity = identities[0];
  if (!identity || !/^events@[^\s@]+\.[^\s@]+$/i.test(identity.from_email) || (multi && identity.from_email.toLowerCase() !== 'events@plottwistco.com')) {
    throw error('event_sender_missing', 'Provision the organization’s events@ email identity before sending invitations.');
  }
  return { agencies, identity };
}

export async function sendCompanyEventInvitationEmail({ event, invitation, user, actorUserId = null, kind = 'invitation', context = null, db = pool }) {
  const { sendEmailFromIdentity } = await import('./unifiedEmail/unifiedEmailSender.service.js');
  const resolved = context || await companyEventEmailContext(event, db);
  const to = String(user.work_email || user.email || '').trim();
  if (!to) return { skipped: true, reason: 'event_email_missing' };
  const links = companyEventInvitationLinks(event, invitation.token);
  const message = companyEventInvitationEmail({ event, user, agencies: resolved.agencies, ...links, kind,
    mandatory: (readEventOperations(event).mandatoryUserIds || []).includes(Number(user.id || invitation.user_id)) });
  return sendEmailFromIdentity({ senderIdentityId: resolved.identity.id, to, ...message, userId: Number(user.id || invitation.user_id),
    generatedByUserId: actorUserId, templateType: kind === 'invitation' ? 'company_event_invitation' : 'company_event_reminder', templateId: Number(event.id),
    source: actorUserId ? 'manual' : 'auto', linkUrl: links.detailsUrl });
}

export async function listCompanyEventInvitations(event, db = pool) {
  const [rows] = await db.execute(`SELECT i.*, u.first_name, u.last_name, u.email, u.work_email, u.phone_number, u.personal_phone, u.work_phone,
      r.response_key
    FROM company_event_invitations i JOIN users u ON u.id = i.user_id
    LEFT JOIN company_event_responses r ON r.company_event_id = i.company_event_id AND r.user_id = i.user_id
    WHERE i.company_event_id = ? AND u.is_active = 1 AND COALESCE(u.is_archived,0) = 0 AND u.terminated_at IS NULL`, [Number(event.id)]);
  return rows || [];
}

const deliveryStatus = result => result?.skipped || result?.redirected ? 'skipped' : result?.pendingApproval ? 'approval'
  : result?.sent === false || result?.held || result?.reason && !result?.id ? 'held' : result?.id || result?.sid || result?.sent === true ? 'sent' : 'held';

/** Each channel is claimed before delivery; an uncertain transport is never replayed automatically. */
export async function deliverCompanyEventInvitation({ event, invitation, actorUserId = null, kind = 'invitation', scheduleKey = 'initial',
  channels = { email: true, inApp: true }, announcement = null, now = new Date(), db = pool,
  sendEmail = sendCompanyEventInvitationEmail, sendSms = sendCompanyEventSms, notify = data => Notification.create(data), context = null }) {
  const results = [];
  const userId = Number(invitation.user_id), agencyId = Number(event.agency_id || event.agencyId);
  const user = { ...invitation, id: userId };
  for (const channel of ['inApp', 'email', 'sms'].filter(key => channels[key] === true)) {
    // A reply arriving during the worker run stops the next RSVP channel too.
    const [[fresh]] = await db.execute(`SELECT i.response, r.response_key FROM company_event_invitations i
      LEFT JOIN company_event_responses r ON r.company_event_id = i.company_event_id AND r.user_id = i.user_id
      WHERE i.id = ? AND i.company_event_id = ?`, [invitation.id, event.id]);
    if (!fresh || (kind === 'rsvp_reminder' && invitationResponse(fresh)) || (kind === 'attendance_reminder' && !['yes', 'maybe'].includes(invitationResponse(fresh)))) continue;
    const [claim] = await db.execute(`INSERT IGNORE INTO company_event_notification_deliveries
      (company_event_id,user_id,channel,delivery_kind,schedule_key) VALUES (?,?,?,?,?)`, [event.id, userId, channel, kind, scheduleKey]);
    if (!claim.affectedRows) continue;
    let status = 'held', reason = null;
    try {
      const links = companyEventInvitationLinks(event, invitation.token);
      if (channel === 'inApp') {
        const message = announcement?.content || (kind === 'attendance_reminder' ? `Your event is coming up: ${event.title}.` : `You have been invited to ${event.title}. Please RSVP Yes, No or Maybe.`);
        await notify({ type: 'company_event_message', severity: 'info', title: announcement ? event.title : kind === 'rsvp_reminder' ? `Please RSVP: ${event.title}` : kind === 'attendance_reminder' ? `Coming up: ${event.title}` : `You’re invited: ${event.title}`,
          message, userId, agencyId, relatedEntityType: 'company_event', relatedEntityId: Number(event.id), actorUserId,
          actorSource: 'company_event_invitation', audienceJson: { navigationUrl: links.detailsUrl, eventId: Number(event.id),
            ...(announcement ? { displayType: 'splash', announcementId: announcement.id, expiresAt: announcement.endsAt || null } : {}) } });
        status = 'sent';
      } else if (channel === 'email') {
        const result = await sendEmail({ event, invitation, user, actorUserId, kind, context, db });
        status = deliveryStatus(result); reason = result?.reason || null;
        if (status === 'sent' && kind === 'invitation') await db.execute('UPDATE company_event_invitations SET email_sent_at = ?, updated_at = ? WHERE id = ?', [now, now, invitation.id]);
      } else {
        const to = invitation.phone_number || invitation.personal_phone || invitation.work_phone;
        if (!to) { status = 'skipped'; reason = 'event_phone_missing'; }
        else {
          const text = kind === 'attendance_reminder'
            ? `Reminder: ${event.title} is coming up. Event details: ${links.smsUrl}`
            : `You have been invited to ${event.title}. Please RSVP via text with Yes, No, Maybe. Event details: ${links.smsUrl}`;
          const result = await sendSms({ eventId: event.id, agencyId, userId, to, event, body: text, purpose: 'workforce', audience: 'staff',
            dispatchType: kind === 'attendance_reminder' ? 'attendance_reminder' : 'rsvp_invitation', batchId: `${kind}:${scheduleKey}` });
          status = result?.sid ? 'sent' : deliveryStatus(result);
        }
      }
    } catch (e) { status = Number(e.status) === 403 ? 'skipped' : 'review'; reason = e.code || e.message; }
    await db.execute('UPDATE company_event_notification_deliveries SET status = ?,status_reason = ?,completed_at = ? WHERE id = ?', [status, reason ? String(reason).slice(0, 255) : null, now, claim.insertId]);
    results.push({ userId, channel, kind, status, reason });
  }
  return results;
}

export async function sendCompanyEventInvitationsForUsers({ event, recipientIds, actorUserId, channels = { email: true, inApp: true, sms: false }, db = pool, ...dependencies }) {
  const ids = [...new Set(recipientIds.map(Number).filter(Boolean))];
  if (!ids.length) return { ok: true, recipients: 0, sentCount: 0, failedCount: 0, deliveries: [] };
  for (const userId of ids) await db.execute(`INSERT INTO company_event_invitations
    (company_event_id,agency_id,user_id,token,created_by_user_id) VALUES (?,?,?,?,?)
    ON DUPLICATE KEY UPDATE updated_at = updated_at`, [event.id, Number(event.agency_id || event.agencyId), userId, randomBytes(24).toString('hex'), actorUserId]);
  const eligible = new Set(ids), invitations = (await listCompanyEventInvitations(event, db)).filter(i => eligible.has(Number(i.user_id)));
  const deliveries = [];
  for (const invitation of invitations) deliveries.push(...await deliverCompanyEventInvitation({ event, invitation, actorUserId, channels, db, ...dependencies }));
  const channelSummary = Object.fromEntries(['inApp','email','sms'].map(channel => [channel, Object.fromEntries(['sent','skipped','held','approval','review']
    .map(status => [status, deliveries.filter(d => d.channel === channel && d.status === status).length]))]));
  return { ok: true, recipients: invitations.length, sentCount: new Set(deliveries.filter(d => d.status === 'sent').map(d => d.userId)).size,
    failedCount: new Set(deliveries.filter(d => ['review','held','approval'].includes(d.status)).map(d => d.userId)).size,
    emailSentCount: channelSummary.email.sent, smsSentCount: channelSummary.sms.sent, inAppSentCount: channelSummary.inApp.sent,
    deliveryCount: deliveries.filter(d => d.status === 'sent').length, channelSummary, deliveries };
}

export async function sendCompanyEventRemindersForUsers({ event, recipientIds, actorUserId, audience = 'attending', channels = { email: true, inApp: true }, db = pool, ...dependencies }) {
  if (!['attending', 'no_response', 'all'].includes(audience)) throw error('event_reminder_audience', 'Choose attending, no response, or all invitees.');
  const allowed = new Set(recipientIds.map(Number)), stamp = `manual:${randomBytes(12).toString('hex')}`, deliveries = [];
  for (const invitation of await listCompanyEventInvitations(event, db)) {
    const response = invitationResponse(invitation);
    if (!allowed.has(Number(invitation.user_id)) || (audience === 'no_response' && response) || (audience === 'attending' && !['yes','maybe'].includes(response))) continue;
    deliveries.push(...await deliverCompanyEventInvitation({ event, invitation, actorUserId, channels, db, kind: response ? 'attendance_reminder' : 'rsvp_reminder', scheduleKey: stamp, ...dependencies }));
  }
  return { ok: true, sent: deliveries.filter(d => d.status === 'sent').length, deliveries };
}
