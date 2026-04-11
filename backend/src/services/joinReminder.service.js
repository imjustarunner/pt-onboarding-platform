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

async function alreadySent(sessionType, sessionId, userId) {
  const [rows] = await pool.execute(
    `SELECT 1 FROM join_reminder_sent
     WHERE session_type = ? AND session_id = ? AND user_id = ?
     LIMIT 1`,
    [sessionType, sessionId, userId]
  );
  return (rows || []).length > 0;
}

async function recordSent(sessionType, sessionId, userId) {
  await pool.execute(
    `INSERT INTO join_reminder_sent (session_type, session_id, user_id)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE sent_at = CURRENT_TIMESTAMP`,
    [sessionType, sessionId, userId]
  );
}

async function sendJoinReminderToUser({ userId, agencyId, joinUrl, label, sessionType, sessionId }) {
  if (!joinUrl || !userId || !agencyId) return { email: false, sms: false };

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
    await recordSent(sessionType, sessionId, userId);
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
              ss.google_meet_link,
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
      const joinUrl = useAppJoin
        ? `${FRONTEND_URL}/join/supervision/${sessionId}`
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
        if (await alreadySent('supervision', sessionId, uid)) continue;
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
      `SELECT pse.id, pse.agency_id, pse.provider_id, pse.title, pse.google_meet_link
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
      const joinUrl = useAppJoin
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
        if (await alreadySent('team_meeting', sessionId, uid)) continue;
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
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE' || e?.code === 'ER_BAD_FIELD_ERROR') {
      return;
    }
    throw e;
  }
}
