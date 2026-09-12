import pool from '../config/database.js';
import { sendNotificationEmail } from './unifiedEmail/unifiedEmailSender.service.js';
import { getAgencyEmailSettings } from './emailSettings.service.js';
import {
  resolveAvailabilitySchedule,
  addBusinessHours
} from './availabilityWindow.service.js';
const DEFAULT_DIGEST_HOURS = 24;
const DEFAULT_SEND_DELAY_SECONDS = 20;
const MAX_SEND_DELAY_SECONDS = 600;

function normalizeDigestHours(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_DIGEST_HOURS;
  return Math.min(168, Math.max(1, Math.round(n)));
}

function normalizeSendDelaySeconds(v, fallback = DEFAULT_SEND_DELAY_SECONDS) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_SEND_DELAY_SECONDS, Math.max(1, Math.round(n)));
}

function mapPrefsRow(row, userId) {
  if (!row) {
    return {
      userId,
      personalEmailNotify: true,
      digestHours: DEFAULT_DIGEST_HOURS,
      digestBusinessHours: null,
      availabilityHoursEnabled: true,
      meetingReminderBypassAvailability: true,
      lastInboxDigestAt: null,
      lastPersonalForwardAt: null,
      sendDelayEmailSeconds: DEFAULT_SEND_DELAY_SECONDS,
      sendDelaySecureSeconds: DEFAULT_SEND_DELAY_SECONDS,
      sendDelayInternalSeconds: DEFAULT_SEND_DELAY_SECONDS,
      sendDelaySmsSeconds: DEFAULT_SEND_DELAY_SECONDS
    };
  }
  return {
    userId,
    personalEmailNotify: !!row.personal_email_notify,
    digestHours: normalizeDigestHours(row.digest_hours),
    digestBusinessHours:
      row.digest_business_hours != null ? normalizeDigestHours(row.digest_business_hours) : null,
    availabilityHoursEnabled: row.availability_hours_enabled !== 0,
    meetingReminderBypassAvailability: row.meeting_reminder_bypass_availability !== 0,
    lastInboxDigestAt: row.last_inbox_digest_at || null,
    lastPersonalForwardAt: row.last_personal_forward_at || null,
    sendDelayEmailSeconds: normalizeSendDelaySeconds(
      row.send_delay_email_seconds,
      DEFAULT_SEND_DELAY_SECONDS
    ),
    sendDelaySecureSeconds: normalizeSendDelaySeconds(
      row.send_delay_secure_seconds,
      DEFAULT_SEND_DELAY_SECONDS
    ),
    sendDelayInternalSeconds: normalizeSendDelaySeconds(
      row.send_delay_internal_seconds,
      DEFAULT_SEND_DELAY_SECONDS
    ),
    sendDelaySmsSeconds: normalizeSendDelaySeconds(
      row.send_delay_sms_seconds,
      DEFAULT_SEND_DELAY_SECONDS
    )
  };
}

export async function getCommunicationPrefs(userId) {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM user_communication_prefs WHERE user_id = ? LIMIT 1`,
      [userId]
    );
    return mapPrefsRow(rows[0], userId);
  } catch (e) {
    // Pre-migration 1380: delay columns may be missing
    if (String(e?.message || '').includes('send_delay_')) {
      const [rows] = await pool.execute(
        `SELECT user_id, personal_email_notify, digest_hours, digest_business_hours,
                availability_hours_enabled, meeting_reminder_bypass_availability,
                last_inbox_digest_at, last_personal_forward_at
         FROM user_communication_prefs WHERE user_id = ? LIMIT 1`,
        [userId]
      );
      return mapPrefsRow(rows[0], userId);
    }
    throw e;
  }
}

export async function updateCommunicationPrefs(userId, patch = {}) {
  const current = await getCommunicationPrefs(userId);
  const personalEmailNotify =
    patch.personalEmailNotify !== undefined ? !!patch.personalEmailNotify : current.personalEmailNotify;
  const digestHours =
    patch.digestHours !== undefined ? normalizeDigestHours(patch.digestHours) : current.digestHours;
  const digestBusinessHours =
    patch.digestBusinessHours !== undefined
      ? patch.digestBusinessHours == null
        ? null
        : normalizeDigestHours(patch.digestBusinessHours)
      : current.digestBusinessHours;
  const availabilityHoursEnabled =
    patch.availabilityHoursEnabled !== undefined
      ? !!patch.availabilityHoursEnabled
      : current.availabilityHoursEnabled;
  const meetingReminderBypassAvailability =
    patch.meetingReminderBypassAvailability !== undefined
      ? !!patch.meetingReminderBypassAvailability
      : current.meetingReminderBypassAvailability;
  const sendDelayEmailSeconds =
    patch.sendDelayEmailSeconds !== undefined
      ? normalizeSendDelaySeconds(patch.sendDelayEmailSeconds)
      : current.sendDelayEmailSeconds;
  const sendDelaySecureSeconds =
    patch.sendDelaySecureSeconds !== undefined
      ? normalizeSendDelaySeconds(patch.sendDelaySecureSeconds)
      : current.sendDelaySecureSeconds;
  const sendDelayInternalSeconds =
    patch.sendDelayInternalSeconds !== undefined
      ? normalizeSendDelaySeconds(patch.sendDelayInternalSeconds)
      : current.sendDelayInternalSeconds;
  const sendDelaySmsSeconds =
    patch.sendDelaySmsSeconds !== undefined
      ? normalizeSendDelaySeconds(patch.sendDelaySmsSeconds)
      : current.sendDelaySmsSeconds;

  try {
    await pool.execute(
      `INSERT INTO user_communication_prefs
        (user_id, personal_email_notify, digest_hours, digest_business_hours,
         availability_hours_enabled, meeting_reminder_bypass_availability,
         send_delay_email_seconds, send_delay_secure_seconds,
         send_delay_internal_seconds, send_delay_sms_seconds)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         personal_email_notify = VALUES(personal_email_notify),
         digest_hours = VALUES(digest_hours),
         digest_business_hours = VALUES(digest_business_hours),
         availability_hours_enabled = VALUES(availability_hours_enabled),
         meeting_reminder_bypass_availability = VALUES(meeting_reminder_bypass_availability),
         send_delay_email_seconds = VALUES(send_delay_email_seconds),
         send_delay_secure_seconds = VALUES(send_delay_secure_seconds),
         send_delay_internal_seconds = VALUES(send_delay_internal_seconds),
         send_delay_sms_seconds = VALUES(send_delay_sms_seconds)`,
      [
        userId,
        personalEmailNotify ? 1 : 0,
        digestHours,
        digestBusinessHours,
        availabilityHoursEnabled ? 1 : 0,
        meetingReminderBypassAvailability ? 1 : 0,
        sendDelayEmailSeconds,
        sendDelaySecureSeconds,
        sendDelayInternalSeconds,
        sendDelaySmsSeconds
      ]
    );
  } catch (e) {
    if (!String(e?.message || '').includes('send_delay_')) throw e;
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
  }
  return getCommunicationPrefs(userId);
}

// Preserve the scheduler entry point while replacing aggregate, non-replyable mail.
export { runPersonalThreadReminders as runInboxDigestTick } from './personalThreadReminder.service.js';

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
     WHERE UPPER(u.status) IN ('ACTIVE','ACTIVE_EMPLOYEE')
       AND COALESCE(u.is_active,1)=1
       AND COALESCE(p.personal_email_notify,1)=1
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
