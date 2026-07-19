/**
 * Join reminder service: sends email/SMS with join link 5 minutes before
 * supervision sessions and team meetings when configured.
 */
import pool from '../config/database.js';
import User from '../models/User.model.js';
import PhoneNumber from '../models/PhoneNumber.model.js';
import VonageService from './vonage.service.js';
import { resolveReminderNumber } from './communicationRouting.service.js';
import { sendNotificationEmail } from './unifiedEmail/unifiedEmailSender.service.js';
import NotificationGatekeeperService from './notificationGatekeeper.service.js';
import { isVideoConfigured } from './video.service.js';

const WINDOW_START_MINUTES = 5;
const WINDOW_END_MINUTES = 8;
const FRONTEND_URL = (process.env.FRONTEND_URL || '').replace(/\/$/, '');

function toSqlDatetime(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function alreadySent(sessionType, sessionId, recipientKey) {
  const key = String(recipientKey || '').trim();
  if (!key) return true;
  const [rows] = await pool.execute(
    `SELECT 1 FROM join_reminder_sent
     WHERE session_type = ? AND session_id = ? AND recipient_key = ?
     LIMIT 1`,
    [sessionType, sessionId, key]
  );
  return (rows || []).length > 0;
}

async function recordSent(sessionType, sessionId, recipientKey, userId = null) {
  const key = String(recipientKey || '').trim();
  if (!key) return;
  await pool.execute(
    `INSERT INTO join_reminder_sent (session_type, session_id, user_id, recipient_key)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE sent_at = CURRENT_TIMESTAMP`,
    [sessionType, sessionId, userId == null ? null : Number(userId), key]
  );
}

async function sendJoinReminderToUser({ userId, agencyId, joinUrl, label, sessionType, sessionId }) {
  if (!joinUrl || !userId || !agencyId) return { email: false, sms: false };
  const recipientKey = `u:${userId}`;
  if (await alreadySent(sessionType, sessionId, recipientKey)) return { email: false, sms: false };

  const user = await User.findById(userId);
  if (!user) return { email: false, sms: false };

  const toEmail = user.email || user.work_email || null;
  const toPhone = user.personal_phone || user.work_phone || user.phone_number || null;
  const toPhoneNorm = toPhone ? PhoneNumber.normalizePhone(toPhone) : null;

  const decision = await NotificationGatekeeperService.decideChannels({
    userId,
    context: { severity: 'info' }
  });

  let emailSent = false;
  let smsSent = false;

  if (decision?.email && toEmail) {
    try {
      const subject = `Join reminder: ${label}`;
      const text = `${label} is starting soon.\n\nJoin here: ${joinUrl}`;
      const html = `<p>${label} is starting soon.</p><p><a href="${joinUrl}">Join here</a></p>`;
      const result = await sendNotificationEmail({
        agencyId,
        triggerKey: 'meeting_join_reminder',
        to: toEmail,
        subject,
        text,
        html,
        source: 'auto',
        userId,
        templateType: 'meeting_join_reminder',
        templateId: null
      });
      if (!result?.skipped) emailSent = true;
    } catch (e) {
      const msg = String(e?.message || '');
      if (!msg.includes('trigger') && !msg.includes('sender')) {
        console.warn('Join reminder email failed:', msg);
      }
    }
  }

  if (decision?.sms && toPhoneNorm) {
    try {
      const resolved = await resolveReminderNumber({ providerUserId: userId, clientId: null });
      const from = resolved?.number?.phone_number
        ? PhoneNumber.normalizePhone(resolved.number.phone_number) || resolved.number.phone_number
        : null;
      if (from) {
        const body = `${label} starting soon. Join: ${joinUrl}`.slice(0, 480);
        await VonageService.sendSms({ to: toPhoneNorm, from, body });
        smsSent = true;
      }
    } catch (e) {
      console.warn('Join reminder SMS failed:', e?.message);
    }
  }

  if (emailSent || smsSent) {
    await recordSent(sessionType, sessionId, recipientKey, userId);
  }

  return { email: emailSent, sms: smsSent };
}

async function sendDiscoveryClientReminder({ agencyId, email, phone, joinUrl, label, sessionId }) {
  if (!joinUrl || !agencyId || !email) return { email: false, sms: false };
  const recipientKey = `e:${String(email).trim().toLowerCase()}`;
  if (await alreadySent('discovery', sessionId, recipientKey)) return { email: false, sms: false };

  let emailSent = false;
  let smsSent = false;

  try {
    const result = await sendNotificationEmail({
      agencyId,
      triggerKey: 'meeting_join_reminder',
      to: email,
      subject: `Join reminder: ${label}`,
      text: `${label} is starting soon.\n\nJoin here: ${joinUrl}`,
      html: `<p>${label} is starting soon.</p><p><a href="${joinUrl}">Join here</a></p>`,
      source: 'auto',
      templateType: 'meeting_join_reminder'
    });
    if (!result?.skipped) emailSent = true;
  } catch (e) {
    console.warn('Discovery client reminder email failed:', e?.message || e);
  }

  if (phone) {
    try {
      const toPhoneNorm = PhoneNumber.normalizePhone(phone);
      const resolved = await resolveReminderNumber({ providerUserId: null, clientId: null });
      const from = resolved?.number?.phone_number
        ? PhoneNumber.normalizePhone(resolved.number.phone_number) || resolved.number.phone_number
        : null;
      if (from && toPhoneNorm) {
        await VonageService.sendSms({
          to: toPhoneNorm,
          from,
          body: `${label} starting soon. Join: ${joinUrl}`.slice(0, 480)
        });
        smsSent = true;
      }
    } catch (e) {
      console.warn('Discovery client reminder SMS failed:', e?.message || e);
    }
  }

  if (emailSent || smsSent) {
    await recordSent('discovery', sessionId, recipientKey, null);
  }
  return { email: emailSent, sms: smsSent };
}

export async function runJoinReminderTick({ now = new Date() } = {}) {
  const start = new Date(now.getTime() + WINDOW_START_MINUTES * 60 * 1000);
  const end = new Date(now.getTime() + WINDOW_END_MINUTES * 60 * 1000);
  const startSql = toSqlDatetime(start);
  const endSql = toSqlDatetime(end);

  const useAppJoin = isVideoConfigured() && FRONTEND_URL;

  try {
    // Supervision sessions starting in 5-8 min
    const [supvRows] = await pool.execute(
      `SELECT ss.id, ss.agency_id, ss.session_type, ss.supervisor_user_id, ss.supervisee_user_id,
              ss.google_meet_link, ss.join_token,
              CONCAT(COALESCE(sup.first_name,''), ' ', COALESCE(sup.last_name,'')) AS supervisor_name
       FROM supervision_sessions ss
       JOIN users sup ON sup.id = ss.supervisor_user_id
       WHERE (ss.status IS NULL OR ss.status <> 'CANCELLED')
         AND ss.start_at >= ? AND ss.start_at < ?
       ORDER BY ss.start_at ASC`,
      [startSql, endSql]
    );

    for (const r of supvRows || []) {
      const sessionId = Number(r.id);
      const agencyId = Number(r.agency_id);
      const label = `Supervision with ${String(r.supervisor_name || '').trim() || 'supervisor'}`;
      const joinKey = String(r.join_token || sessionId || '').trim();
      const joinUrl = useAppJoin && joinKey
        ? `${FRONTEND_URL}/join/supervision/${encodeURIComponent(joinKey)}`
        : (r.google_meet_link ? String(r.google_meet_link).trim() : null);
      if (!joinUrl) continue;

      const userIds = new Set([
        Number(r.supervisor_user_id || 0),
        Number(r.supervisee_user_id || 0)
      ]);

      const [attendees] = await pool.execute(
        `SELECT user_id FROM supervision_session_attendees WHERE session_id = ?`,
        [sessionId]
      );
      for (const a of attendees || []) {
        if (a.user_id) userIds.add(Number(a.user_id));
      }

      for (const uid of userIds) {
        if (!uid) continue;
        await sendJoinReminderToUser({
          userId: uid,
          agencyId,
          joinUrl,
          label,
          sessionType: 'supervision',
          sessionId
        });
      }
    }

    // Team meetings starting in 5-8 min
    const [teamRows] = await pool.execute(
      `SELECT pse.id, pse.agency_id, pse.provider_id, pse.title, pse.google_meet_link, pse.platform_video_link
       FROM provider_schedule_events pse
       WHERE UPPER(COALESCE(pse.kind, '')) = 'TEAM_MEETING'
         AND (pse.status IS NULL OR pse.status = 'ACTIVE')
         AND pse.start_at >= ? AND pse.start_at < ?
       ORDER BY pse.start_at ASC`,
      [startSql, endSql]
    );

    for (const r of teamRows || []) {
      const sessionId = Number(r.id);
      let agencyId = Number(r.agency_id || 0);
      if (!agencyId && r.provider_id) {
        const agencies = await User.getAgencies(Number(r.provider_id));
        agencyId = agencies?.[0]?.id || 0;
      }
      const label = String(r.title || 'Team meeting').trim() || 'Team meeting';
      const hasPlatformLink = r.platform_video_link == null || Number(r.platform_video_link) === 1;
      const joinUrl = useAppJoin && hasPlatformLink
        ? `${FRONTEND_URL}/join/team-meeting/${sessionId}`
        : (r.google_meet_link ? String(r.google_meet_link).trim() : null);
      if (!joinUrl) continue;

      const userIds = new Set([Number(r.provider_id || 0)]);

      const [attendees] = await pool.execute(
        `SELECT user_id FROM provider_schedule_event_attendees WHERE event_id = ?`,
        [sessionId]
      );
      for (const a of attendees || []) {
        if (a.user_id) userIds.add(Number(a.user_id));
      }

      for (const uid of userIds) {
        if (!uid) continue;
        await sendJoinReminderToUser({
          userId: uid,
          agencyId,
          joinUrl,
          label,
          sessionType: 'team_meeting',
          sessionId
        });
      }
    }

    // Discovery sessions starting in 5-8 min
    const [discRows] = await pool.execute(
      `SELECT id, agency_id, provider_id, access_token, client_email, client_phone, client_name, booked_start_at
       FROM discovery_sessions
       WHERE status = 'BOOKED'
         AND booked_start_at >= ? AND booked_start_at < ?
       ORDER BY booked_start_at ASC`,
      [startSql, endSql]
    );

    for (const r of discRows || []) {
      const sessionId = Number(r.id);
      const agencyId = Number(r.agency_id || 0);
      const label = `Discovery call with ${String(r.client_name || 'client').trim()}`;
      let joinUrl = null;
      if (useAppJoin && r.access_token) {
        const [agencyRows] = await pool.execute(`SELECT slug FROM agencies WHERE id = ? LIMIT 1`, [agencyId]);
        const slug = agencyRows?.[0]?.slug;
        if (slug) joinUrl = `${FRONTEND_URL}/${encodeURIComponent(slug)}/discovery/${encodeURIComponent(r.access_token)}`;
      }
      if (!joinUrl) continue;

      if (r.provider_id) {
        await sendJoinReminderToUser({
          userId: Number(r.provider_id),
          agencyId,
          joinUrl,
          label,
          sessionType: 'discovery',
          sessionId
        });
      }
      if (r.client_email) {
        await sendDiscoveryClientReminder({
          agencyId,
          email: r.client_email,
          phone: r.client_phone,
          joinUrl,
          label: 'Your discovery call',
          sessionId
        });
      }
    }
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE' || e?.code === 'ER_BAD_FIELD_ERROR') {
      return;
    }
    throw e;
  }
}
