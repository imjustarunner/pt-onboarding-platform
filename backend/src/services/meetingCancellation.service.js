/**
 * Meeting cancellation service.
 *
 * Cancels a TEAM_MEETING / HUDDLE row in provider_schedule_events, best-effort
 * removes the Google Calendar event, and emails the attendees + host using the
 * `meeting_cancelled` notification trigger.
 *
 * Used by the Ask the Assistant cancelMeeting / cancelTodaysRemainingMeetings
 * tools.
 */
import pool from '../config/database.js';
import User from '../models/User.model.js';
import ProviderScheduleEvent from '../models/ProviderScheduleEvent.model.js';
import ProviderScheduleEventAttendee from '../models/ProviderScheduleEventAttendee.model.js';
import GoogleCalendarService from './googleCalendar.service.js';
import { sendNotificationEmail } from './unifiedEmail/unifiedEmailSender.service.js';

function fmtTime(d) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  return dt.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

/**
 * Email a single recipient about a cancelled meeting. Best-effort — never
 * throws (returns false on any failure so the caller can keep going).
 */
async function emailOneCancellation({
  agencyId,
  recipientUser,
  meetingTitle,
  meetingStartAt,
  cancelledByName,
  reason
}) {
  if (!recipientUser?.email) return false;
  const when = fmtTime(meetingStartAt);
  const subject = `Meeting cancelled: ${meetingTitle}`;
  const reasonLine = reason ? `\n\nReason: ${reason}` : '';
  const text =
    `${cancelledByName} cancelled the meeting "${meetingTitle}"` +
    (when ? ` scheduled for ${when}` : '') +
    `.${reasonLine}\n\nNo action is needed on your end.`;
  const html =
    `<p><strong>${cancelledByName}</strong> cancelled the meeting ` +
    `<strong>"${meetingTitle}"</strong>` +
    (when ? ` scheduled for <strong>${when}</strong>` : '') +
    `.</p>` +
    (reason ? `<p><em>Reason:</em> ${reason}</p>` : '') +
    `<p>No action is needed on your end.</p>`;

  try {
    const result = await sendNotificationEmail({
      agencyId,
      triggerKey: 'meeting_cancelled',
      to: recipientUser.email,
      subject,
      text,
      html,
      source: 'auto',
      userId: recipientUser.id || null,
      templateType: 'meeting_cancelled',
      templateId: null
    });
    return !result?.skipped;
  } catch (e) {
    const msg = String(e?.message || '');
    if (!msg.includes('trigger') && !msg.includes('sender')) {
      console.warn('[meetingCancellation] email failed:', msg);
    }
    return false;
  }
}

/**
 * Cancel one meeting (provider_schedule_events row).
 *
 * Returns:
 *   { ok, eventId, title, attendeesNotified, hostNotified, alreadyCancelled? }
 */
export async function cancelOneMeeting({
  eventId,
  actorUserId,
  reason = null
}) {
  const event = await ProviderScheduleEvent.findById(eventId);
  if (!event) {
    const err = new Error('Meeting not found');
    err.status = 404;
    throw err;
  }
  if (String(event.status || '').trim().toUpperCase() === 'CANCELLED') {
    return {
      ok: true,
      eventId,
      title: event.title,
      attendeesNotified: 0,
      hostNotified: false,
      alreadyCancelled: true
    };
  }

  // Best-effort: remove the Google Calendar event for the host.
  try {
    const host = await User.findById(event.provider_id);
    const subjectEmail = String(host?.email || '').trim().toLowerCase();
    const gid = String(event.google_event_id || '').trim();
    if (subjectEmail && gid) {
      await GoogleCalendarService.deleteEvent({
        subjectEmail,
        calendarId: 'primary',
        eventId: gid
      }).catch(() => {});
    }
  } catch {
    /* noop */
  }

  await ProviderScheduleEvent.cancelByIds({
    eventIds: [Number(event.id)],
    updatedByUserId: actorUserId
  });

  // Compose notifications.
  const actor = actorUserId ? await User.findById(actorUserId).catch(() => null) : null;
  const cancelledByName = actor
    ? ([actor.first_name, actor.last_name].filter(Boolean).join(' ').trim() || actor.email || 'Someone')
    : 'Someone';

  const attendees = await ProviderScheduleEventAttendee.listByEventId(event.id);
  let attendeesNotified = 0;
  for (const a of attendees) {
    // Skip the actor (they obviously know)
    if (Number(a.user_id) === Number(actorUserId)) continue;
    const ok = await emailOneCancellation({
      agencyId: event.agency_id,
      recipientUser: { id: a.user_id, email: a.email },
      meetingTitle: event.title,
      meetingStartAt: event.start_at,
      cancelledByName,
      reason
    });
    if (ok) attendeesNotified += 1;
  }

  // Also email the host if the canceller wasn't the host.
  let hostNotified = false;
  if (Number(event.provider_id) && Number(event.provider_id) !== Number(actorUserId)) {
    const host = await User.findById(event.provider_id);
    if (host) {
      hostNotified = await emailOneCancellation({
        agencyId: event.agency_id,
        recipientUser: { id: host.id, email: host.email },
        meetingTitle: event.title,
        meetingStartAt: event.start_at,
        cancelledByName,
        reason
      });
    }
  }

  return {
    ok: true,
    eventId: Number(event.id),
    title: event.title,
    attendeesNotified,
    hostNotified
  };
}

/**
 * List the actor's TEAM_MEETING / HUDDLE rows that are still scheduled for
 * later today (start_at >= now AND <= end of day in server local time, status
 * != CANCELLED). Caller is expected to be the host (we filter by provider_id).
 */
export async function listRemainingMeetingsForToday({ actorUserId, agencyId }) {
  if (!actorUserId) return [];
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const ymd = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const nowSql = `${ymd} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const endSql = `${ymd} 23:59:59`;

  const params = [actorUserId, nowSql, endSql];
  let agencyClause = '';
  if (agencyId) {
    agencyClause = ' AND agency_id = ?';
    params.push(Number(agencyId));
  }

  const [rows] = await pool.execute(
    `SELECT id, agency_id, provider_id, kind, title, start_at, end_at, status
     FROM provider_schedule_events
     WHERE provider_id = ?
       AND UPPER(COALESCE(kind, '')) IN ('TEAM_MEETING', 'HUDDLE')
       AND UPPER(COALESCE(status, 'ACTIVE')) <> 'CANCELLED'
       AND start_at IS NOT NULL
       AND start_at >= ?
       AND start_at <= ?
       ${agencyClause}
     ORDER BY start_at ASC`,
    params
  );
  return rows || [];
}

/**
 * Cancel everything in `listRemainingMeetingsForToday`. Returns a summary.
 */
export async function cancelTodaysRemaining({ actorUserId, agencyId, reason = null }) {
  const meetings = await listRemainingMeetingsForToday({ actorUserId, agencyId });
  if (!meetings.length) {
    return { ok: true, cancelledCount: 0, results: [] };
  }
  const results = [];
  for (const m of meetings) {
    try {
      const r = await cancelOneMeeting({ eventId: m.id, actorUserId, reason });
      results.push(r);
    } catch (e) {
      results.push({
        ok: false,
        eventId: m.id,
        title: m.title,
        error: e?.message || 'Cancel failed'
      });
    }
  }
  const cancelledCount = results.filter((r) => r.ok && !r.alreadyCancelled).length;
  return { ok: true, cancelledCount, results };
}

export default {
  cancelOneMeeting,
  listRemainingMeetingsForToday,
  cancelTodaysRemaining
};
