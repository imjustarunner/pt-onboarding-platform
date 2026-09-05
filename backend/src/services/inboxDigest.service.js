import pool from '../config/database.js';
import { sendNotificationEmail } from './unifiedEmail/unifiedEmailSender.service.js';
import { getAgencyEmailSettings } from './emailSettings.service.js';
import {
  resolveAvailabilitySchedule,
  addBusinessHours
} from './availabilityWindow.service.js';
import {
  getCredentialStatus,
  ensurePersistentToken,
  issueDeliveryToken,
  buildDeliveryQuickViewUrl
} from './quickViewAuth.service.js';

const DEFAULT_DIGEST_HOURS = 24;

function normalizeDigestHours(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_DIGEST_HOURS;
  return Math.min(168, Math.max(1, Math.round(n)));
}

export async function getCommunicationPrefs(userId) {
  const [rows] = await pool.execute(
    `SELECT * FROM user_communication_prefs WHERE user_id = ? LIMIT 1`,
    [userId]
  );
  if (rows[0]) {
    return {
      userId,
      personalEmailNotify: !!rows[0].personal_email_notify,
      digestHours: normalizeDigestHours(rows[0].digest_hours),
      digestBusinessHours: rows[0].digest_business_hours != null
        ? normalizeDigestHours(rows[0].digest_business_hours)
        : null,
      availabilityHoursEnabled: rows[0].availability_hours_enabled !== 0,
      meetingReminderBypassAvailability: rows[0].meeting_reminder_bypass_availability !== 0,
      lastInboxDigestAt: rows[0].last_inbox_digest_at || null,
      lastPersonalForwardAt: rows[0].last_personal_forward_at || null
    };
  }
  return {
    userId,
    personalEmailNotify: false,
    digestHours: DEFAULT_DIGEST_HOURS,
    digestBusinessHours: null,
    availabilityHoursEnabled: true,
    meetingReminderBypassAvailability: true,
    lastInboxDigestAt: null,
    lastPersonalForwardAt: null
  };
}

export async function updateCommunicationPrefs(userId, patch = {}) {
  const current = await getCommunicationPrefs(userId);
  const personalEmailNotify =
    patch.personalEmailNotify !== undefined ? !!patch.personalEmailNotify : current.personalEmailNotify;
  const digestHours =
    patch.digestHours !== undefined ? normalizeDigestHours(patch.digestHours) : current.digestHours;
  const digestBusinessHours =
    patch.digestBusinessHours !== undefined
      ? (patch.digestBusinessHours == null ? null : normalizeDigestHours(patch.digestBusinessHours))
      : current.digestBusinessHours;
  const availabilityHoursEnabled =
    patch.availabilityHoursEnabled !== undefined
      ? !!patch.availabilityHoursEnabled
      : current.availabilityHoursEnabled;
  const meetingReminderBypassAvailability =
    patch.meetingReminderBypassAvailability !== undefined
      ? !!patch.meetingReminderBypassAvailability
      : current.meetingReminderBypassAvailability;

  await pool.execute(
    `INSERT INTO user_communication_prefs
      (user_id, personal_email_notify, digest_hours, digest_business_hours,
       availability_hours_enabled, meeting_reminder_bypass_availability)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       personal_email_notify = VALUES(personal_email_notify),
       digest_hours = VALUES(digest_hours),
       digest_business_hours = VALUES(digest_business_hours),
       availability_hours_enabled = VALUES(availability_hours_enabled),
       meeting_reminder_bypass_availability = VALUES(meeting_reminder_bypass_availability)`,
    [
      userId,
      personalEmailNotify ? 1 : 0,
      digestHours,
      digestBusinessHours,
      availabilityHoursEnabled ? 1 : 0,
      meetingReminderBypassAvailability ? 1 : 0
    ]
  );
  return getCommunicationPrefs(userId);
}

/**
 * After 24 Availability Hours without open/read, notify personal_email with Quick View CTA.
 * Never includes message body / PHI — counts + safe subjects only.
 */
export async function runInboxDigestTick({ now = new Date() } = {}) {
  const [prefsRows] = await pool.execute(
    `SELECT p.user_id, p.digest_hours, p.digest_business_hours, p.last_inbox_digest_at, p.last_personal_forward_at,
            u.personal_email, u.email, u.first_name,
            (
              SELECT ua.agency_id FROM user_agencies ua
              WHERE ua.user_id = u.id AND (ua.is_active = 1 OR ua.is_active IS NULL)
              ORDER BY ua.agency_id ASC LIMIT 1
            ) AS agency_id
     FROM user_communication_prefs p
     JOIN users u ON u.id = p.user_id
     WHERE p.personal_email_notify = 1
       AND u.status = 'active'
       AND (u.personal_email IS NOT NULL AND TRIM(u.personal_email) <> '')`
  );

  let sent = 0;
  for (const row of prefsRows || []) {
    const to = String(row.personal_email || '').trim();
    if (!to) continue;
    const agencyId = row.agency_id || null;
    let agencySettings = null;
    try {
      agencySettings = agencyId ? await getAgencyEmailSettings(agencyId) : null;
    } catch {
      agencySettings = null;
    }
    if (agencySettings && agencySettings.personalEmailDigestEnabled === false) continue;

    const businessHours = normalizeDigestHours(
      row.digest_business_hours
        ?? agencySettings?.personalEmailDigestBusinessHours
        ?? row.digest_hours
        ?? DEFAULT_DIGEST_HOURS
    );

    const schedule = await resolveAvailabilitySchedule(row.user_id, { agencyId });
    // Throttle: at most one digest per ~business-hours window (wall clock approx for throttle)
    if (row.last_personal_forward_at || row.last_inbox_digest_at) {
      const last = new Date(row.last_personal_forward_at || row.last_inbox_digest_at);
      if (now - last < businessHours * 60 * 60 * 1000 * 0.5) continue;
    }

    // Eligible: unread (no read row or last_read before last inbound), not unknown, visible
    const [convs] = await pool.execute(
      `SELECT c.id, c.subject, c.status, c.priority, c.last_message_at, c.agency_id,
              c.personal_forward_eligible_at, c.personal_forwarded_at,
              r.last_read_at
       FROM communication_conversations c
       LEFT JOIN communication_conversation_reads r
         ON r.conversation_id = c.id AND r.user_id = ?
       WHERE c.archived_at IS NULL
         AND COALESCE(c.is_spam, 0) = 0
         AND COALESCE(c.is_unknown_sender, 0) = 0
         AND (c.visible_after IS NULL OR c.visible_after <= ?)
         AND c.status IN ('new', 'needs_reply', 'follow_up')
         AND (c.owner_user_id = ? OR c.owner_user_id IS NULL)
         AND c.personal_forwarded_at IS NULL
         AND (c.snoozed_until IS NULL OR c.snoozed_until <= ?)
         AND (
           r.last_read_at IS NULL
           OR r.last_read_at < COALESCE(c.last_message_at, c.updated_at)
         )
       ORDER BY COALESCE(c.last_message_at, c.created_at) ASC
       LIMIT 30`,
      [row.user_id, now, row.user_id, now]
    );

    const eligible = [];
    for (const c of convs || []) {
      const started = new Date(c.last_message_at || now);
      let eligibleAt = c.personal_forward_eligible_at
        ? new Date(c.personal_forward_eligible_at)
        : addBusinessHours(schedule, started, businessHours);
      if (!c.personal_forward_eligible_at) {
        await pool.execute(
          `UPDATE communication_conversations SET personal_forward_eligible_at = ? WHERE id = ? AND personal_forward_eligible_at IS NULL`,
          [eligibleAt, c.id]
        ).catch(() => {});
      }
      if (eligibleAt <= now) eligible.push(c);
    }
    if (!eligible.length) continue;

    // Ensure Quick View passcode exists conceptually; CTA uses ephemeral delivery token
    // so digests never revoke the Account Info persistent bookmark URL.
    const status = await getCredentialStatus(row.user_id);
    if (!status.hasPasscode) {
      // Skip until employee sets Quick View passcode in Account Info → Privacy
      continue;
    }
    if (!status.hasToken) {
      await ensurePersistentToken({ userId: row.user_id, agencyId });
    }
    const delivery = await issueDeliveryToken({
      userId: row.user_id,
      agencyId,
      purpose: 'digest',
      expiresInHours: Math.max(businessHours * 2, 72)
    });

    const Agency = (await import('../models/Agency.model.js')).default;
    const { buildQuickViewHomeUrl } = await import('../utils/publicPortalUrl.js');
    let baseUrl = String(process.env.APP_PUBLIC_URL || process.env.FRONTEND_URL || 'https://plottwisthq.com').replace(/\/$/, '');
    let tenantName = 'PlotTwistHQ';
    if (agencyId) {
      const agency = await Agency.findById(agencyId);
      if (agency?.name) tenantName = agency.name;
      if (agency) baseUrl = buildQuickViewHomeUrl(agency);
    }
    const quickUrl = buildDeliveryQuickViewUrl({ baseUrl, deliveryToken: delivery.token });

    const count = eligible.length;
    const lines = eligible.slice(0, 12).map((c) => {
      const subj = String(c.subject || '(no subject)').slice(0, 80);
      return `• ${subj}`;
    });

    const subject = `${tenantName} Forwarded Email: ${count} message${count === 1 ? '' : 's'} waiting`;
    const html = `
      <p>Hi ${row.first_name || 'there'},</p>
      <p>You have <strong>${count}</strong> message${count === 1 ? '' : 's'} waiting in ${tenantName}
      (unopened for ${businessHours} Availability Hours).</p>
      <p>${lines.join('<br/>')}</p>
      <p><a href="${quickUrl}">Open Quick View</a> — enter your 6-digit Quick View passcode to continue.</p>
      <p style="color:#64748b;font-size:12px">This email does not include message content. Replies are made in the app.
      Message bodies are never forwarded to your personal email.</p>
    `;

    try {
      await sendNotificationEmail({
        to,
        subject,
        html,
        text: `You have ${count} message(s) waiting.\n${lines.join('\n')}\n\nOpen Quick View: ${quickUrl}`,
        agencyId,
        userId: row.user_id,
        templateType: 'inbox_digest',
        source: 'auto'
      });
      await pool.execute(
        `UPDATE user_communication_prefs
         SET last_inbox_digest_at = ?, last_personal_forward_at = ?
         WHERE user_id = ?`,
        [now, now, row.user_id]
      );
      for (const c of eligible) {
        await pool.execute(
          `UPDATE communication_conversations SET personal_forwarded_at = ? WHERE id = ?`,
          [now, c.id]
        );
      }
      sent += 1;
    } catch (e) {
      console.warn('[inboxDigest] send failed for user', row.user_id, e?.message || e);
    }
  }

  return { sent, checked: (prefsRows || []).length };
}

/**
 * 24h Availability Hours unread digest for SSO / group-password users who have
 * unread secure/hub chat messages. Branded messages@ From; never exposes other
 * parties' personal/SSO addresses in headers.
 */
export async function runHubSecureUnreadDigestTick({ now = new Date() } = {}) {
  const [users] = await pool.execute(
    `SELECT u.id AS user_id, u.email, u.personal_email, u.first_name, u.sso_password_override,
            COALESCE(p.digest_hours, ?) AS digest_hours,
            p.digest_business_hours,
            p.last_inbox_digest_at,
            (
              SELECT ua.agency_id FROM user_agencies ua
              WHERE ua.user_id = u.id AND (ua.is_active = 1 OR ua.is_active IS NULL)
              ORDER BY ua.agency_id ASC LIMIT 1
            ) AS agency_id
     FROM users u
     LEFT JOIN user_communication_prefs p ON p.user_id = u.id
     WHERE u.status = 'active'
       AND (
         u.sso_password_override = 1
         OR COALESCE(p.personal_email_notify, 0) = 1
       )
       AND (
         (u.personal_email IS NOT NULL AND TRIM(u.personal_email) <> '')
         OR (u.email IS NOT NULL AND TRIM(u.email) <> '')
       )
     LIMIT 500`,
    [DEFAULT_DIGEST_HOURS]
  );

  let sent = 0;
  for (const row of users || []) {
    const agencyId = row.agency_id || null;
    if (!agencyId) continue;

    const to = String(row.personal_email || row.email || '').trim().toLowerCase();
    if (!to) continue;

    const businessHours = normalizeDigestHours(
      row.digest_business_hours ?? row.digest_hours ?? DEFAULT_DIGEST_HOURS
    );

    if (row.last_inbox_digest_at) {
      const last = new Date(row.last_inbox_digest_at);
      if (now - last < businessHours * 60 * 60 * 1000 * 0.5) continue;
    }

    const schedule = await resolveAvailabilitySchedule(row.user_id, { agencyId });

    // Unread chat messages in threads the user belongs to
    const [unread] = await pool.execute(
      `SELECT t.id AS thread_id, MIN(m.created_at) AS oldest_unread_at, COUNT(*) AS unread_count
       FROM chat_thread_participants p
       JOIN chat_threads t ON t.id = p.thread_id
       JOIN chat_messages m ON m.thread_id = t.id
       LEFT JOIN chat_thread_reads r ON r.thread_id = t.id AND r.user_id = ?
       WHERE p.user_id = ?
         AND t.agency_id = ?
         AND m.sender_user_id <> ?
         AND (r.last_read_message_id IS NULL OR m.id > r.last_read_message_id)
         AND m.created_at <= ?
       GROUP BY t.id
       HAVING unread_count > 0
       ORDER BY oldest_unread_at ASC
       LIMIT 20`,
      [row.user_id, row.user_id, agencyId, row.user_id, now]
    );

    const eligible = [];
    for (const u of unread || []) {
      const started = new Date(u.oldest_unread_at || now);
      const eligibleAt = addBusinessHours(schedule, started, businessHours);
      if (eligibleAt <= now) eligible.push(u);
    }
    if (!eligible.length) continue;

    const Agency = (await import('../models/Agency.model.js')).default;
    const agency = await Agency.findById(agencyId);
    const tenantName = agency?.name || 'Your care team';
    const slug = agency?.slug || '';
    const baseUrl = String(process.env.APP_PUBLIC_URL || process.env.FRONTEND_URL || 'https://plottwisthq.com').replace(
      /\/$/,
      ''
    );
    const messagesUrl = `${baseUrl}/${slug}/messages`;

    const count = eligible.reduce((n, x) => n + Number(x.unread_count || 0), 0);
    const { buildBrandedMessageEmailHtml } = await import('./hubBrandedEmail.service.js');
    const html = buildBrandedMessageEmailHtml({
      agencyName: tenantName,
      senderDisplayName: tenantName,
      bodyText: `You have ${count} unread message${count === 1 ? '' : 's'} waiting in Messages (unopened for about ${businessHours} Availability Hours). Open the app to read and reply. Message content is not included in this email.`,
      history: [],
      appUrl: messagesUrl,
      footerNote:
        'This digest never includes message bodies or other people’s personal email addresses. Reply in the app.'
    });

    try {
      const { ensureTenantMessageMailboxes } = await import('./tenantMessageMailboxes.service.js');
      const mailboxes = await ensureTenantMessageMailboxes(agencyId).catch(() => null);
      if (mailboxes?.messages?.id) {
        const { sendEmailFromIdentity } = await import('./unifiedEmail/unifiedEmailSender.service.js');
        await sendEmailFromIdentity({
          senderIdentityId: mailboxes.messages.id,
          to,
          subject: `${tenantName}: ${count} unread message${count === 1 ? '' : 's'}`,
          html,
          text: `You have ${count} unread message(s).\n\nOpen: ${messagesUrl}`,
          replyToOverride: mailboxes.messages.from_email,
          source: 'auto',
          templateType: 'hub_secure_unread_digest',
          userId: row.user_id
        });
      } else {
        await sendNotificationEmail({
          to,
          subject: `${tenantName}: ${count} unread message${count === 1 ? '' : 's'}`,
          html,
          text: `You have ${count} unread message(s).\n\nOpen: ${messagesUrl}`,
          agencyId,
          userId: row.user_id,
          templateType: 'hub_secure_unread_digest',
          source: 'auto'
        });
      }
      await pool.execute(
        `INSERT INTO user_communication_prefs (user_id, personal_email_notify, digest_hours, last_inbox_digest_at)
         VALUES (?, 1, ?, ?)
         ON DUPLICATE KEY UPDATE last_inbox_digest_at = VALUES(last_inbox_digest_at)`,
        [row.user_id, businessHours, now]
      );
      sent += 1;
    } catch (e) {
      console.warn('[hubSecureDigest] send failed for user', row.user_id, e?.message || e);
    }
  }

  return { sent, checked: (users || []).length };
}
