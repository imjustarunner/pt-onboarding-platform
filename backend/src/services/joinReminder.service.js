import { meetingReminderSchedule } from './meetingReminderPolicy.js';
import { tenantMeetingBase } from '../utils/tenantMeetingUrl.js';
import { personalMeetingInvitation } from './meetingInvitations.service.js';
import { escapeMeetingHtml } from './meetingInvitationPolicy.js';
/**
 * Join reminder service: sends email/SMS with join link 5 minutes before
 * supervision sessions and team meetings when configured.
 */
import pool from '../config/database.js';
import User from '../models/User.model.js';
import PhoneNumber from '../models/PhoneNumber.model.js';
import VonageService from './vonage.service.js';
import { resolveReminderNumber } from './communicationRouting.service.js';
import { meetingReplyTo } from './meetingParticipants.service.js';
import { sendNotificationEmail } from './unifiedEmail/unifiedEmailSender.service.js';
import NotificationGatekeeperService from './notificationGatekeeper.service.js';
import { isVideoConfigured } from './video.service.js';
import { toMysqlUtcDateTime, parseUtcDate } from '../utils/officeEventDateTime.util.js';

const WINDOW_START_MINUTES = 5;
const WINDOW_END_MINUTES = 8;
const FRONTEND_URL = (process.env.FRONTEND_URL || '').replace(/\/$/, '');

/** UTC MySQL DATETIME for comparing against UTC-stored start_at columns. */
function toSqlDatetimeUtc(d) {
  return toMysqlUtcDateTime(d);
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
  const db = await pool.getConnection();
  const lock = `join-reminder:${sessionType}:${sessionId}:${userId}`;
  let acquired = false;
  try {
    const [rows] = await db.execute('SELECT GET_LOCK(?,0) AS acquired',[lock]);
    acquired = !!rows[0].acquired;
    if (!acquired) return {email:false,sms:false};
    return await deliverJoinReminderToUser({userId,agencyId,joinUrl,label,sessionType,sessionId});
  } finally {
    if (acquired) await db.execute('SELECT RELEASE_LOCK(?)',[lock]);
    db.release();
  }
}

async function deliverJoinReminderToUser({ userId, agencyId, joinUrl, label, sessionType, sessionId }) {
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
    context: { severity: 'info', isMeetingReminder: true }
  });

  let emailSent = false;
  let smsSent = false;

  // Prefer Quick View deep link for non-SSO / personal-email staff when configured
  let finalJoinUrl = joinUrl;
  let when = 'starting soon';
  let replyTo;
  let meetingEvent;
  if (sessionType === 'team_meeting' || sessionType === 'supervision') {
    const table = sessionType === 'supervision' ? 'supervision_sessions' : 'provider_schedule_events';
    const [events] = await pool.execute(`SELECT * FROM ${table} WHERE id=?`,[sessionId]);
    if (events[0]) {
      meetingEvent = events[0];
      replyTo=await meetingReplyTo(sessionType==='supervision'?{...events[0],meeting_type:'supervision',provider_id:events[0].supervisor_user_id}:events[0]);
      finalJoinUrl = (await personalMeetingInvitation(events[0],userId)).url;
      const tz = events[0].event_timezone || 'America/Denver';
      when = `scheduled for ${new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:tz}).format(parseUtcDate(events[0].start_at))} (${tz})`;
    }
  }
  try {
    const { getAgencyEmailSettings } = await import('./emailSettings.service.js');
    const {
      getCredentialStatus,
      ensurePersistentToken,
      issueDeliveryToken,
      buildDeliveryQuickViewUrl
    } = await import('./quickViewAuth.service.js');
    const settings = await getAgencyEmailSettings(agencyId);
    if (settings.quickViewEnabled && !['team_meeting','supervision'].includes(sessionType)) {
      const status = await getCredentialStatus(userId);
      if (!status.hasPasscode) {
        // Fall back to direct join until passcode is set
      } else {
        if (!status.hasToken) {
          await ensurePersistentToken({ userId, agencyId });
        }
        const joinType = sessionType === 'supervision' ? 'supervision' : 'team-meeting';
        const deepPath = `/quick-view-join?type=${encodeURIComponent(joinType)}&id=${encodeURIComponent(sessionId)}`;
        const delivery = await issueDeliveryToken({
          userId,
          agencyId,
          purpose: 'join_reminder',
          deepLinkPath: deepPath,
          expiresInHours: 12
        });
        let baseUrl = (process.env.FRONTEND_URL || FRONTEND_URL || '').replace(/\/$/, '');
        try {
          const Agency = (await import('../models/Agency.model.js')).default;
          const { buildQuickViewHomeUrl } = await import('../utils/publicPortalUrl.js');
          const agency = await Agency.findById(agencyId);
          if (agency) baseUrl = buildQuickViewHomeUrl(agency);
        } catch { /* keep platform base */ }
        finalJoinUrl = buildDeliveryQuickViewUrl({
          baseUrl,
          deliveryToken: delivery.token,
          joinType,
          joinId: sessionId
        });
      }
    }
  } catch (e) {
    // fall back to original joinUrl
  }

  if (decision?.email && toEmail) {
    try {
      const subject = `Join reminder: ${label}`;
      const text = `${label} is ${when}.\n\nYour personal join link: ${finalJoinUrl}\nSign in with your invited account.`;
      const html = `<p>${escapeMeetingHtml(label)} is ${escapeMeetingHtml(when)}.</p><p><a href="${escapeMeetingHtml(finalJoinUrl)}">Join your meeting</a></p><p>Sign in with your invited account.</p>`;
      const result = sessionType === 'supervision' && meetingEvent
        ? await (await import('./supervisionEmail.service.js')).sendSupervisionEmail({session:meetingEvent,user,kind:'join_reminder'})
        : await sendNotificationEmail({
        agencyId,
        triggerKey: 'meeting_join_reminder',
        to: toEmail,
        replyToOverride: replyTo,
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
        const body = `${label} ${when}. Join: ${finalJoinUrl}`.slice(0, 480);
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

/** UTC window used to find sessions starting in ~5–8 minutes (for tests + tick). */
export function joinReminderWindowSql({ now = new Date() } = {}) {
  const start = new Date(now.getTime() + WINDOW_START_MINUTES * 60 * 1000);
  const end = new Date(now.getTime() + WINDOW_END_MINUTES * 60 * 1000);
  return {
    startSql: toSqlDatetimeUtc(start),
    endSql: toSqlDatetimeUtc(end)
  };
}

export async function runJoinReminderTick({ now = new Date() } = {}) {
  const { startSql, endSql } = joinReminderWindowSql({ now });

  const useAppJoin = isVideoConfigured();

  try {
    // Supervision sessions starting in 5-8 min
    let supvRows = [];
    try {
      const [rows] = await pool.execute(
        `SELECT ss.id, ss.agency_id, ss.session_type, ss.supervisor_user_id, ss.supervisee_user_id,
                ss.google_meet_link, ss.join_token, ss.enrollment_mode, ss.notify_participants,
                CONCAT(COALESCE(sup.first_name,''), ' ', COALESCE(sup.last_name,'')) AS supervisor_name
         FROM supervision_sessions ss
         JOIN users sup ON sup.id = ss.supervisor_user_id
         WHERE (ss.status IS NULL OR ss.status <> 'CANCELLED')
           AND ss.reminder_minutes IS NOT NULL
           AND ss.status='SCHEDULED'
           AND ss.start_at > ?
           AND DATE_SUB(ss.start_at, INTERVAL ss.reminder_minutes MINUTE) <= ?
           AND DATE_SUB(ss.start_at, INTERVAL ss.reminder_minutes MINUTE) > DATE_SUB(?, INTERVAL 3 MINUTE)
         ORDER BY ss.start_at ASC`,
        [toSqlDatetimeUtc(now),toSqlDatetimeUtc(now),toSqlDatetimeUtc(now)]
      );
      supvRows = rows || [];
    } catch (e) {
      if (!/enrollment_mode|notify_participants/i.test(String(e?.message || ''))) throw e;
      const [rows] = await pool.execute(
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
      supvRows = rows || [];
    }

    for (const r of supvRows || []) {
      const sessionId = Number(r.id);
      // Opt-out via notify_participants boolean (default on when column missing).
      if (r.notify_participants === 0 || r.notify_participants === false || r.notify_participants === '0') {
        continue;
      }
      const isSignupOnly = String(r.enrollment_mode || '').trim().toLowerCase() === 'signup_only';
      const agencyId = Number(r.agency_id);
      const label = `Supervision with ${String(r.supervisor_name || '').trim() || 'supervisor'}`;
      const joinKey = String(r.join_token || sessionId || '').trim();
      const joinUrl = useAppJoin && joinKey
        ? `${await tenantMeetingBase(agencyId)}/join/supervision/${encodeURIComponent(joinKey)}`
        : (r.google_meet_link ? String(r.google_meet_link).trim() : null);
      if (!joinUrl) continue;

      const userIds = new Set([
        Number(r.supervisor_user_id || 0)
      ]);
      if (!isSignupOnly) {
        userIds.add(Number(r.supervisee_user_id || 0));
      }

      const [attendees] = await pool.execute(
        `SELECT user_id, status FROM supervision_session_attendees WHERE session_id = ?`,
        [sessionId]
      );
      if (isSignupOnly) {
        for (const a of attendees || []) {
          const uid = Number(a.user_id || 0);
          const st = String(a.status || '').trim().toUpperCase();
          if (uid && ['SIGNED_UP', 'JOINED'].includes(st)) userIds.add(uid);
        }
      } else {
        for (const a of attendees || []) {
          if (a.user_id && !['DECLINED','WITHDRAWN','REMOVED','CANCELLED'].includes(String(a.status || '').toUpperCase())) userIds.add(Number(a.user_id));
        }
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

    // Team meetings + huddles starting in 5-8 min
    let teamRows = [];
    try {
      const [rows] = await pool.execute(
        `SELECT pse.id, pse.agency_id, pse.provider_id, pse.title, pse.kind, pse.google_meet_link,
                pse.platform_video_link, pse.notify_participants, pse.participant_join_token, pse.join_token
         FROM provider_schedule_events pse
         WHERE UPPER(COALESCE(pse.kind, '')) IN ('TEAM_MEETING', 'HUDDLE')
           AND (pse.status IS NULL OR pse.status = 'ACTIVE')
           AND pse.meeting_settings_json IS NULL
           AND pse.reminder_minutes IS NOT NULL
           AND pse.meeting_completed_at IS NULL
           AND pse.start_at > ?
           AND DATE_SUB(pse.start_at, INTERVAL pse.reminder_minutes MINUTE) <= ?
           AND DATE_SUB(pse.start_at, INTERVAL pse.reminder_minutes MINUTE) > DATE_SUB(?, INTERVAL 3 MINUTE)
         ORDER BY pse.start_at ASC`,
        [toSqlDatetimeUtc(now), toSqlDatetimeUtc(now), toSqlDatetimeUtc(now)]
      );
      teamRows = rows || [];
    } catch (e) {
      if (!/notify_participants|participant_join_token/i.test(String(e?.message || ''))) throw e;
      const [rows] = await pool.execute(
        `SELECT pse.id, pse.agency_id, pse.provider_id, pse.title, pse.kind, pse.google_meet_link, pse.platform_video_link
         FROM provider_schedule_events pse
         WHERE UPPER(COALESCE(pse.kind, '')) IN ('TEAM_MEETING', 'HUDDLE')
           AND (pse.status IS NULL OR pse.status = 'ACTIVE')
           AND pse.meeting_settings_json IS NULL
           AND pse.start_at >= ? AND pse.start_at < ?
         ORDER BY pse.start_at ASC`,
        [startSql, endSql]
      );
      teamRows = rows || [];
    }

    for (const r of teamRows || []) {
      if (r.notify_participants === 0 || r.notify_participants === false || r.notify_participants === '0') {
        continue;
      }
      const sessionId = Number(r.id);
      let agencyId = Number(r.agency_id || 0);
      if (!agencyId && r.provider_id) {
        const agencies = await User.getAgencies(Number(r.provider_id));
        agencyId = agencies?.[0]?.id || 0;
      }
      const kind = String(r.kind || '').toUpperCase();
      const label = String(r.title || (kind === 'HUDDLE' ? 'Huddle' : 'Team meeting')).trim()
        || (kind === 'HUDDLE' ? 'Huddle' : 'Team meeting');
      const hasPlatformLink = r.platform_video_link == null || Number(r.platform_video_link) === 1;
      const joinKey = String(r.participant_join_token || r.join_token || sessionId || '').trim();
      const joinUrl = useAppJoin && hasPlatformLink && joinKey
        ? `${await tenantMeetingBase(agencyId)}/join/team-meeting/${encodeURIComponent(joinKey)}`
        : (r.google_meet_link ? String(r.google_meet_link).trim() : null);
      if (!joinUrl) continue;

      const userIds = new Set([Number(r.provider_id || 0)]);

      const [attendees] = await pool.execute(
        `SELECT user_id FROM provider_schedule_event_attendees WHERE event_id = ?`,
        [sessionId]
      );
      for (const a of attendees || []) {
        if (a.user_id && !['DECLINED','WITHDRAWN','REMOVED','CANCELLED'].includes(String(a.status || '').toUpperCase())) userIds.add(Number(a.user_id));
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
        joinUrl = `${await tenantMeetingBase(agencyId)}/discovery/${encodeURIComponent(r.access_token)}`;
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

function sessionTypeForScheduleKind(kind) {
  const k = String(kind || '').trim().toUpperCase();
  if (k === 'HUDDLE') return 'team_meeting';
  if (k === 'TEAM_MEETING') return 'team_meeting';
  return null;
}

function reminderFireAtFromStart(startAt, minutes = WINDOW_START_MINUTES) {
  if (minutes === null) return null;
  const d = parseUtcDate(startAt);
  if (!d) return null;
  d.setUTCMinutes(d.getUTCMinutes() - minutes);
  return d.toISOString();
}

/**
 * Notification plan for TEAM_MEETING / HUDDLE schedule events (join reminders, not appointment session notifications).
 */
export async function buildScheduleEventNotificationPlan(eventRow) {
  const eventId = Number(eventRow?.id || 0);
  const kind = String(eventRow?.kind || '').trim().toUpperCase();
  const sessionType = sessionTypeForScheduleKind(kind);
  if (!eventId || !sessionType) {
    return { items: [], attendees: [], canSendAdditionalReminder: false };
  }

  const notifyOn = !(
    eventRow.notify_participants === 0
    || eventRow.notify_participants === false
    || eventRow.notify_participants === '0'
  );
  const hostId = Number(eventRow.provider_id || 0);
  const title = String(eventRow.title || (kind === 'HUDDLE' ? 'Huddle' : 'Team meeting')).trim()
    || (kind === 'HUDDLE' ? 'Huddle' : 'Team meeting');
  const startAt = eventRow.start_at || null;
  const minutes = eventRow.reminder_minutes === undefined ? 5 : eventRow.reminder_minutes;
  const fireAt = notifyOn ? reminderFireAtFromStart(startAt, minutes) : null;
  const nowMs = Date.now();
  const startParsed = parseUtcDate(startAt);
  const startMs = startParsed ? startParsed.getTime() : NaN;
  const meetingStarted = Number.isFinite(startMs) && startMs <= nowMs;

  const userIds = new Set();
  if (hostId > 0) userIds.add(hostId);

  const [attendeeRows] = await pool.execute(
    `SELECT user_id FROM provider_schedule_event_attendees WHERE event_id = ?`,
    [eventId]
  );
  for (const row of attendeeRows || []) {
    const uid = Number(row.user_id || 0);
    if (uid > 0) userIds.add(uid);
  }

  const sentByUserId = new Map();
  try {
    const [sentRows] = await pool.execute(
      `SELECT user_id, recipient_key, sent_at
       FROM join_reminder_sent
       WHERE session_type = ? AND session_id = ?`,
      [sessionType, eventId]
    );
    for (const row of sentRows || []) {
      const uid = Number(row.user_id || 0);
      const key = String(row.recipient_key || '').trim();
      const parsedUid = key.startsWith('u:') ? Number(key.slice(2)) : uid;
      if (parsedUid > 0) {
        sentByUserId.set(parsedUid, row.sent_at || null);
      }
    }
  } catch (e) {
    if (e?.code !== 'ER_NO_SUCH_TABLE' && e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
  }

  const attendees = [];
  const items = [];

  for (const uid of userIds) {
    const user = await User.findById(uid);
    const name = user
      ? `${String(user.first_name || '').trim()} ${String(user.last_name || '').trim()}`.trim() || user.email || `User #${uid}`
      : `User #${uid}`;

    let emailEnabled = false;
    let smsEnabled = false;
    try {
      const decision = await NotificationGatekeeperService.decideChannels({
        userId: uid,
        context: { severity: 'info', isMeetingReminder: true }
      });
      emailEnabled = !!decision?.email;
      smsEnabled = !!decision?.sms;
    } catch {
      emailEnabled = true;
    }

    attendees.push({
      userId: uid,
      name,
      displayName: name,
      emailEnabled,
      smsEnabled,
      inAppEnabled: emailEnabled
    });

    const sentAt = parseUtcDate(sentByUserId.get(uid))?.toISOString();
    if (sentAt) {
      items.push({
        id: `join-sent-${uid}`,
        kind: 'join_reminder',
        label: 'Join reminder',
        status: 'Sent',
        channel: smsEnabled && emailEnabled ? 'email_sms' : (smsEnabled ? 'sms' : 'email'),
        recipientName: name,
        at: sentAt,
        sentAt
      });
    } else if (fireAt && !meetingStarted) {
      items.push({
        id: `join-scheduled-${uid}`,
        kind: 'join_reminder',
        label: 'Join reminder',
        status: 'Scheduled',
        channel: smsEnabled && emailEnabled ? 'email_sms' : (smsEnabled ? 'sms' : 'email'),
        recipientName: name,
        scheduledFor: fireAt,
        fireAt,
        bodyPreview: `${title} — automatic reminder ${minutes} minutes before start`
      });
    }
  }

  // Invitations and hiring delivery are separate from join reminders; expose both.
  const [invitations] = await pool.execute(`SELECT i.user_id,COALESCE(uc.delivery_status,i.delivery_status) delivery_status,COALESCE(uc.sent_at,i.sent_at) sent_at,i.ready_at FROM meeting_email_invitations i LEFT JOIN user_communications uc ON uc.id=i.communication_id WHERE i.event_id=? AND i.meeting_type='team_meeting'`,[eventId]);
  for(const invite of invitations) {
    if(invite.delivery_status==='none')continue;
    const person=attendees.find(a=>Number(a.userId)===Number(invite.user_id));
    items.push({id:`invitation-${invite.user_id}`,kind:'booking',label:'Booking invitation',status:invite.delivery_status==='sent'?'Sent':invite.delivery_status==='approval'||invite.delivery_status==='pending_approval'?'Pending approval':invite.delivery_status==='pending'?'Scheduled':invite.delivery_status,channel:'email',recipientName:person?.name||'Participant',sentAt:parseUtcDate(invite.sent_at)?.toISOString(),scheduledFor:parseUtcDate(invite.ready_at)?.toISOString()});
  }
  const [interviews] = await pool.execute(`SELECT hi.candidate_user_id,hi.invite_sent_at,hi.invite_error,u.first_name,u.last_name FROM hiring_interviews hi JOIN users u ON u.id=hi.candidate_user_id WHERE hi.provider_schedule_event_id=?`,[eventId]);
  for(const interview of interviews) {
    const name=[interview.first_name,interview.last_name].filter(Boolean).join(' ');
    attendees.push({userId:interview.candidate_user_id,name,displayName:name,emailEnabled:true,smsEnabled:false,inAppEnabled:false});
    if(interview.invite_sent_at || interview.invite_error)items.push({id:`candidate-invite-${interview.candidate_user_id}`,kind:'booking',label:'Interview invitation',status:interview.invite_sent_at?'Sent':'Failed',channel:'email',recipientName:name,sentAt:parseUtcDate(interview.invite_sent_at)?.toISOString(),bodyPreview:interview.invite_error||'Interview booking invitation'});
  }
  if(eventRow.meeting_settings_json || interviews.length) {
    for(let i=items.length-1;i>=0;i--)if(eventRow.meeting_settings_json && items[i].kind==='join_reminder'&&items[i].status==='Scheduled')items.splice(i,1);
    const [deliveries]=await pool.execute('SELECT d.user_id,d.reminder_key,COALESCE(uc.sent_at,d.sent_at) sent_at,COALESCE(uc.delivery_status,d.delivery_status) delivery_status FROM meeting_reminder_deliveries d LEFT JOIN user_communications uc ON uc.id=d.communication_id WHERE d.event_id=? AND d.start_at=?',[eventId,eventRow.start_at]);
    for(const person of attendees.filter(a=>eventRow.meeting_settings_json || interviews.some(i=>Number(i.candidate_user_id)===Number(a.userId))))for(const reminder of meetingReminderSchedule(eventRow)) {
      const sent=deliveries.find(d=>Number(d.user_id)===Number(person.userId)&&d.reminder_key===reminder.key);
      if(!sent&&(!notifyOn||reminder.at.getTime()<nowMs))continue;
      items.push({id:`configured-${person.userId}-${reminder.key}`,kind:'join_reminder',label:`Meeting reminder · ${reminder.label}`,status:!sent?'Scheduled':['sent','delivered','read'].includes(sent.delivery_status)?'Sent':/pending|approval/.test(sent.delivery_status)?'Pending approval':sent.delivery_status,channel:'email',recipientName:person.name,sentAt:sent?.delivery_status==='sent'?parseUtcDate(sent?.sent_at)?.toISOString():undefined,scheduledFor:reminder.at.toISOString()});
    }
  }
  items.sort((a, b) => {
    const aRaw = a.sentAt || a.scheduledFor || a.fireAt || '';
    const bRaw = b.sentAt || b.scheduledFor || b.fireAt || '';
    return String(aRaw).localeCompare(String(bRaw));
  });

  return {
    items,
    attendees,
    canSendAdditionalReminder: false,
    meetingTitle: title,
    reminderWindowMinutes: minutes
  };
}
