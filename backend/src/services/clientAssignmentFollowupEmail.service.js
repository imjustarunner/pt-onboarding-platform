/**
 * Deferred email for unread client_assigned in-app notifications.
 * Immediate notice stays in-app only; after 24h unread → branded notifications@ email
 * (no client name/initials; school + service day only).
 */
import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import EmailSenderIdentity from '../models/EmailSenderIdentity.model.js';
import { resolvePreferredSenderIdentityForAgency } from './emailSenderIdentityResolver.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { buildClientAssignedEmailHtml } from './brandedNotificationEmail.service.js';
import { publicAppBaseUrl } from './contactReminderToken.service.js';
import { buildPublicAppUrl } from '../utils/publicPortalUrl.js';

const FOLLOWUP_HOURS = 24;
const NOREPLY_REPLY_TO = 'noreply@itsco.health';

function parseAudienceJson(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw)) || {};
  } catch {
    return {};
  }
}

function usesGoogleSso(user) {
  // Password override means they log in without Google SSO.
  return !(user?.sso_password_override === true || Number(user?.sso_password_override) === 1);
}

/**
 * Personal email when the provider does not use SSO.
 * SSO users rely on the in-app notification only (no deferred email).
 */
export function resolveAssignmentFollowupRecipient(user) {
  if (!user) return null;
  if (usesGoogleSso(user)) return null;
  return (
    String(user.personal_email || '').trim()
    || String(user.email || '').trim()
    || String(user.work_email || '').trim()
    || null
  );
}

async function resolveNotificationsSender({ agencyId } = {}) {
  const aid = Number(agencyId || 0) || null;
  const notificationsEmail = 'notifications@itsco.health';
  let fromIdentity = null;
  if (aid) {
    fromIdentity = await resolvePreferredSenderIdentityForAgency({
      agencyId: aid,
      preferredKeys: ['notifications', 'system', 'inbox'],
      includePlatformDefaults: false,
      onlyActive: true
    });
    if (fromIdentity) {
      const fe = String(fromIdentity.from_email || '').trim().toLowerCase();
      if (fe !== notificationsEmail) {
        const list = await EmailSenderIdentity.list({
          agencyId: aid,
          includePlatformDefaults: false,
          onlyActive: true
        });
        fromIdentity = (list || []).find(
          (row) => String(row?.from_email || '').trim().toLowerCase() === notificationsEmail
        ) || fromIdentity;
      }
    }
  }
  if (!Number(fromIdentity?.id || 0)) return null;
  return { senderIdentityId: Number(fromIdentity.id) };
}

async function markFollowupSent(notificationId) {
  try {
    await pool.execute(
      `UPDATE notifications SET email_followup_sent_at = NOW() WHERE id = ?`,
      [notificationId]
    );
  } catch (err) {
    // Column may not exist until migration 1408 runs — avoid failing the tick hard.
    if (err?.code === 'ER_BAD_FIELD_ERROR') {
      console.warn('[clientAssignmentFollowup] email_followup_sent_at missing — run migration 1408');
      return;
    }
    throw err;
  }
}

/**
 * Send branded follow-up emails for unread client_assigned notifications older than 24h.
 */
export async function processClientAssignmentFollowupEmails({ now = new Date() } = {}) {
  let rows;
  try {
    const [result] = await pool.execute(
      `SELECT id, user_id, agency_id, audience_json, related_entity_id, created_at
       FROM notifications
       WHERE type = 'client_assigned'
         AND user_id IS NOT NULL
         AND is_read = FALSE
         AND is_resolved = FALSE
         AND email_followup_sent_at IS NULL
         AND created_at <= DATE_SUB(?, INTERVAL ? HOUR)
       ORDER BY id ASC
       LIMIT 100`,
      [now, FOLLOWUP_HOURS]
    );
    rows = result || [];
  } catch (err) {
    if (err?.code === 'ER_BAD_FIELD_ERROR') {
      return { ran: false, reason: 'missing_column', sent: 0 };
    }
    throw err;
  }

  const results = { ran: true, scanned: rows.length, sent: 0, skipped: 0, errors: 0 };

  for (const row of rows) {
    const notificationId = Number(row.id);
    try {
      const meta = parseAudienceJson(row.audience_json);
      const schoolName = String(meta.schoolName || meta.agencyName || '').trim() || 'your school';
      const serviceDay = String(meta.serviceDay || '').trim() || null;

      const provider = await User.findById(row.user_id);
      if (usesGoogleSso(provider)) {
        // SSO providers: in-app only — do not email personal/work for this trigger.
        await markFollowupSent(notificationId);
        results.skipped += 1;
        continue;
      }
      const to = resolveAssignmentFollowupRecipient(provider);
      if (!to) {
        await markFollowupSent(notificationId);
        results.skipped += 1;
        continue;
      }

      const agencyId = Number(row.agency_id || provider?.agency_id || 0) || null;
      const sender = await resolveNotificationsSender({ agencyId });
      if (!sender?.senderIdentityId) {
        results.skipped += 1;
        continue;
      }

      let appUrl = '';
      try {
        const agency = agencyId ? await Agency.findById(agencyId) : null;
        appUrl = buildPublicAppUrl(agency || { slug: 'itsco' }, 'login')
          || `${String(publicAppBaseUrl() || '').replace(/\/+$/, '')}/login`;
      } catch {
        appUrl = `${String(publicAppBaseUrl() || '').replace(/\/+$/, '')}/login`;
      }

      const dayPhrase = serviceDay ? ` on ${serviceDay}` : '';
      const subject = 'A new client has been added to your caseload';
      const text = [
        'A new client has been added to your caseload and you have new tasks waiting in the app.',
        `School: ${schoolName}${dayPhrase}.`,
        '',
        'Please sign in to review and complete your new client tasks:',
        appUrl,
        '',
        'This is an automated message. Replies are not monitored.'
      ].join('\n');

      const html = buildClientAssignedEmailHtml({
        agencyName: schoolName,
        serviceDay: serviceDay || '',
        colorPalette: null,
        appUrl
      });

      const sendResult = await sendEmailFromIdentity({
        senderIdentityId: sender.senderIdentityId,
        to,
        subject,
        text,
        html,
        source: 'auto',
        agencyId,
        userId: Number(row.user_id),
        templateType: 'client_assigned',
        fromDisplayNameOverride: 'Notifications',
        replyToOverride: NOREPLY_REPLY_TO
      });

      if (sendResult?.skipped || sendResult?.blocked) {
        results.skipped += 1;
        // Still mark so we do not retry forever when channel is disabled.
        await markFollowupSent(notificationId);
        continue;
      }

      await markFollowupSent(notificationId);
      results.sent += 1;
    } catch (err) {
      console.error('[clientAssignmentFollowup] failed for notification', notificationId, err?.message || err);
      results.errors += 1;
    }
  }

  return results;
}

export default {
  processClientAssignmentFollowupEmails,
  resolveAssignmentFollowupRecipient
};
