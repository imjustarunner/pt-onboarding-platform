/**
 * Meeting lifecycle service for ad-hoc TEAM_MEETING / HUDDLE rows.
 *
 * Owns: cancel, reschedule, bulk-shift, and the post-create invite email.
 * Each write path emails the affected people via sendNotificationEmail using
 * one of the meeting_* trigger keys (cancelled / invited / rescheduled).
 *
 * Used by the Ask the Assistant tools (cancelMeeting,
 * cancelTodaysRemainingMeetings, rescheduleMeeting,
 * pushTodaysRemainingMeetings) and by startMeeting for the invite email.
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

// =====================================================================
// INVITE — sent right after startMeeting creates the TEAM_MEETING.
// =====================================================================

/**
 * Email an attendee that they've been added to a meeting. Best-effort.
 */
export async function sendMeetingInviteEmail({
  agencyId,
  attendeeUser,
  hostUser,
  meetingTitle,
  meetingStartAt,
  meetingEndAt,
  joinUrl
}) {
  if (!attendeeUser?.email) return false;
  const when = fmtTime(meetingStartAt);
  const endLabel = meetingEndAt ? fmtTime(meetingEndAt) : '';
  const hostName = hostUser
    ? ([hostUser.first_name, hostUser.last_name].filter(Boolean).join(' ').trim() || hostUser.email || 'Someone')
    : 'Someone';
  const subject = `${hostName} invited you: ${meetingTitle}`;
  const text =
    `${hostName} invited you to a meeting "${meetingTitle}"` +
    (when ? ` on ${when}` : '') +
    (endLabel ? ` (until ${new Date(meetingEndAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })})` : '') +
    `.\n\nJoin here: ${joinUrl}`;
  const html =
    `<p><strong>${hostName}</strong> invited you to a meeting ` +
    `<strong>"${meetingTitle}"</strong>` +
    (when ? ` on <strong>${when}</strong>` : '') +
    `.</p>` +
    `<p><a href="${joinUrl}">Join the meeting</a></p>` +
    `<p style="color:#666;font-size:12px">If the link doesn't work, paste this into your browser:<br/>${joinUrl}</p>`;

  try {
    const result = await sendNotificationEmail({
      agencyId,
      triggerKey: 'meeting_invited',
      to: attendeeUser.email,
      subject,
      text,
      html,
      source: 'auto',
      userId: attendeeUser.id || null,
      templateType: 'meeting_invited',
      templateId: null
    });
    return !result?.skipped;
  } catch (e) {
    const msg = String(e?.message || '');
    if (!msg.includes('trigger') && !msg.includes('sender')) {
      console.warn('[meetingCancellation] invite email failed:', msg);
    }
    return false;
  }
}

// =====================================================================
// RESCHEDULE — single + bulk shift.
// =====================================================================

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toMysqlDateTimeWall(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/**
 * Email one recipient about a rescheduled meeting. Best-effort.
 */
async function emailOneReschedule({
  agencyId,
  recipientUser,
  meetingTitle,
  oldStartAt,
  newStartAt,
  rescheduledByName,
  reason
}) {
  if (!recipientUser?.email) return false;
  const oldWhen = fmtTime(oldStartAt);
  const newWhen = fmtTime(newStartAt);
  const subject = `Rescheduled: ${meetingTitle}`;
  const reasonLine = reason ? `\n\nReason: ${reason}` : '';
  const text =
    `${rescheduledByName} moved the meeting "${meetingTitle}"` +
    (oldWhen ? ` from ${oldWhen}` : '') +
    (newWhen ? ` to ${newWhen}` : '') +
    `.${reasonLine}\n\nNo action is needed on your end — the existing join link still works.`;
  const html =
    `<p><strong>${rescheduledByName}</strong> moved the meeting ` +
    `<strong>"${meetingTitle}"</strong>` +
    (oldWhen ? ` from <strong>${oldWhen}</strong>` : '') +
    (newWhen ? ` to <strong>${newWhen}</strong>` : '') +
    `.</p>` +
    (reason ? `<p><em>Reason:</em> ${reason}</p>` : '') +
    `<p>No action is needed on your end — the existing join link still works.</p>`;

  try {
    const result = await sendNotificationEmail({
      agencyId,
      triggerKey: 'meeting_rescheduled',
      to: recipientUser.email,
      subject,
      text,
      html,
      source: 'auto',
      userId: recipientUser.id || null,
      templateType: 'meeting_rescheduled',
      templateId: null
    });
    return !result?.skipped;
  } catch (e) {
    const msg = String(e?.message || '');
    if (!msg.includes('trigger') && !msg.includes('sender')) {
      console.warn('[meetingCancellation] reschedule email failed:', msg);
    }
    return false;
  }
}

/**
 * Reschedule one meeting to a new wall-clock start time. The duration is
 * preserved unless newEndAt is supplied explicitly.
 *
 * Returns:
 *   { ok, eventId, title, oldStartAt, newStartAt, attendeesNotified, hostNotified }
 */
export async function rescheduleOneMeeting({
  eventId,
  newStartAt,
  newEndAt = null,
  reason = null,
  actorUserId
}) {
  const event = await ProviderScheduleEvent.findById(eventId);
  if (!event) {
    const err = new Error('Meeting not found');
    err.status = 404;
    throw err;
  }
  if (String(event.status || '').trim().toUpperCase() === 'CANCELLED') {
    const err = new Error('That meeting is already cancelled — start a new one instead.');
    err.status = 400;
    throw err;
  }
  if (Number(event.all_day) === 1) {
    const err = new Error('All-day events cannot be rescheduled by time.');
    err.status = 400;
    throw err;
  }

  const newStart = newStartAt instanceof Date ? newStartAt : new Date(newStartAt);
  if (!newStart || isNaN(newStart.getTime())) {
    const err = new Error('newStartAt is required and must be a valid date');
    err.status = 400;
    throw err;
  }

  // Preserve the original duration if newEndAt wasn't supplied.
  let newEnd = newEndAt instanceof Date ? newEndAt : (newEndAt ? new Date(newEndAt) : null);
  if (!newEnd || isNaN(newEnd?.getTime?.())) {
    const oldStart = event.start_at ? new Date(event.start_at) : null;
    const oldEnd = event.end_at ? new Date(event.end_at) : null;
    const durationMs = (oldStart && oldEnd && oldEnd > oldStart) ? (oldEnd - oldStart) : 30 * 60 * 1000;
    newEnd = new Date(newStart.getTime() + durationMs);
  }
  if (newEnd <= newStart) {
    const err = new Error('newEndAt must be after newStartAt');
    err.status = 400;
    throw err;
  }

  const oldStartIso = event.start_at;
  const newStartSql = toMysqlDateTimeWall(newStart);
  const newEndSql = toMysqlDateTimeWall(newEnd);

  await pool.execute(
    `UPDATE provider_schedule_events
     SET start_at = ?, end_at = ?, updated_by_user_id = ?
     WHERE id = ?`,
    [newStartSql, newEndSql, actorUserId ? Number(actorUserId) : null, Number(event.id)]
  );

  // Best-effort: patch the host's Google Calendar event time.
  try {
    const host = await User.findById(event.provider_id);
    const subjectEmail = String(host?.email || '').trim().toLowerCase();
    const gid = String(event.google_event_id || '').trim();
    if (subjectEmail && gid && typeof GoogleCalendarService.patchEventTimes === 'function') {
      await GoogleCalendarService.patchEventTimes({
        subjectEmail,
        calendarId: 'primary',
        eventId: gid,
        startAtIso: newStart.toISOString(),
        endAtIso: newEnd.toISOString()
      }).catch(() => {});
    }
  } catch {
    /* noop */
  }

  // Notify everyone.
  const actor = actorUserId ? await User.findById(actorUserId).catch(() => null) : null;
  const rescheduledByName = actor
    ? ([actor.first_name, actor.last_name].filter(Boolean).join(' ').trim() || actor.email || 'Someone')
    : 'Someone';

  const attendees = await ProviderScheduleEventAttendee.listByEventId(event.id);
  let attendeesNotified = 0;
  for (const a of attendees) {
    if (Number(a.user_id) === Number(actorUserId)) continue;
    const ok = await emailOneReschedule({
      agencyId: event.agency_id,
      recipientUser: { id: a.user_id, email: a.email },
      meetingTitle: event.title,
      oldStartAt: oldStartIso,
      newStartAt: newStart,
      rescheduledByName,
      reason
    });
    if (ok) attendeesNotified += 1;
  }

  let hostNotified = false;
  if (Number(event.provider_id) && Number(event.provider_id) !== Number(actorUserId)) {
    const host = await User.findById(event.provider_id);
    if (host) {
      hostNotified = await emailOneReschedule({
        agencyId: event.agency_id,
        recipientUser: { id: host.id, email: host.email },
        meetingTitle: event.title,
        oldStartAt: oldStartIso,
        newStartAt: newStart,
        rescheduledByName,
        reason
      });
    }
  }

  return {
    ok: true,
    eventId: Number(event.id),
    title: event.title,
    oldStartAt: oldStartIso,
    newStartAt: newStartSql,
    newEndAt: newEndSql,
    attendeesNotified,
    hostNotified
  };
}

/**
 * Shift every remaining meeting today by N minutes (positive = later). Uses
 * `listRemainingMeetingsForToday` to pick affected rows. Returns a summary.
 */
export async function pushTodaysRemaining({ actorUserId, agencyId, shiftMinutes, reason = null }) {
  const minutes = Math.trunc(Number(shiftMinutes));
  if (!Number.isFinite(minutes) || minutes === 0) {
    const err = new Error('shiftMinutes must be a non-zero integer');
    err.status = 400;
    throw err;
  }
  const meetings = await listRemainingMeetingsForToday({ actorUserId, agencyId });
  if (!meetings.length) return { ok: true, shiftedCount: 0, results: [] };

  const results = [];
  for (const m of meetings) {
    if (!m.start_at || !m.end_at) {
      results.push({ ok: false, eventId: m.id, title: m.title, error: 'Meeting has no start/end' });
      continue;
    }
    const oldStart = new Date(m.start_at);
    const oldEnd = new Date(m.end_at);
    const newStart = new Date(oldStart.getTime() + minutes * 60 * 1000);
    const newEnd = new Date(oldEnd.getTime() + minutes * 60 * 1000);
    try {
      const r = await rescheduleOneMeeting({
        eventId: m.id,
        newStartAt: newStart,
        newEndAt: newEnd,
        reason,
        actorUserId
      });
      results.push(r);
    } catch (e) {
      results.push({ ok: false, eventId: m.id, title: m.title, error: e?.message || 'Reschedule failed' });
    }
  }
  const shiftedCount = results.filter((r) => r.ok).length;
  return { ok: true, shiftedCount, shiftMinutes: minutes, results };
}

// =====================================================================
// SEARCH — find a meeting by attendee name and/or start time.
// Returns the actor's TEAM_MEETING / HUDDLE rows that match.
// =====================================================================

/**
 * Find the actor's active TEAM_MEETING / HUDDLE rows for today (forward only,
 * unless `includePast` is true), optionally narrowed by attendee name and/or
 * start time (HH:MM 24h). Includes meetings where the actor is host OR an
 * attendee.
 */
export async function findMyMeetings({
  actorUserId,
  agencyId,
  withName = null,
  atTimeHm = null,   // 'HH:MM' 24h
  includePast = false
}) {
  if (!actorUserId) return [];
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const ymd = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const dayStart = `${ymd} 00:00:00`;
  const cutoff = includePast
    ? `${ymd} 00:00:00`
    : `${ymd} ${pad(now.getHours())}:${pad(now.getMinutes())}:00`;
  const dayEnd = `${ymd} 23:59:59`;

  const params = [actorUserId, actorUserId, dayStart, dayEnd, cutoff];
  let agencyClause = '';
  if (agencyId) {
    agencyClause = ' AND pse.agency_id = ?';
    params.push(Number(agencyId));
  }

  const [rows] = await pool.execute(
    `SELECT pse.id, pse.agency_id, pse.provider_id, pse.kind, pse.title,
            pse.start_at, pse.end_at, pse.status
     FROM provider_schedule_events pse
     WHERE UPPER(COALESCE(pse.kind, '')) IN ('TEAM_MEETING', 'HUDDLE')
       AND UPPER(COALESCE(pse.status, 'ACTIVE')) <> 'CANCELLED'
       AND pse.start_at IS NOT NULL
       AND (
         pse.provider_id = ?
         OR EXISTS (
           SELECT 1 FROM provider_schedule_event_attendees psea
           WHERE psea.event_id = pse.id AND psea.user_id = ?
         )
       )
       AND pse.start_at >= ?
       AND pse.start_at <= ?
       AND pse.start_at >= ?
       ${agencyClause}
     ORDER BY pse.start_at ASC`,
    params
  );

  let candidates = rows || [];

  // Filter by attendee name (case-insensitive substring on first/last/email).
  if (withName) {
    const needle = String(withName).trim().toLowerCase();
    if (needle) {
      const filtered = [];
      for (const m of candidates) {
        const att = await ProviderScheduleEventAttendee.listByEventId(m.id);
        const host = await User.findById(m.provider_id).catch(() => null);
        const everyone = [...att.map((a) => ({
          first_name: a.first_name, last_name: a.last_name, email: a.email
        }))];
        if (host) everyone.push({ first_name: host.first_name, last_name: host.last_name, email: host.email });
        const hit = everyone.some((p) => {
          const full = `${p.first_name || ''} ${p.last_name || ''}`.trim().toLowerCase();
          const em = String(p.email || '').toLowerCase();
          return (full && full.includes(needle)) ||
                 (em && em.includes(needle)) ||
                 (String(p.first_name || '').toLowerCase() === needle) ||
                 (String(p.last_name || '').toLowerCase() === needle);
        });
        if (hit) filtered.push({ ...m, _matchedName: needle });
      }
      candidates = filtered;
    }
  }

  // Filter by start time HH:MM (today).
  if (atTimeHm) {
    const m = String(atTimeHm).match(/^(\d{1,2}):?(\d{2})?$/);
    if (m) {
      const hh = Math.max(0, Math.min(23, parseInt(m[1], 10)));
      const mm = Math.max(0, Math.min(59, parseInt(m[2] || '0', 10)));
      candidates = candidates.filter((row) => {
        if (!row.start_at) return false;
        const d = new Date(row.start_at);
        return d.getHours() === hh && d.getMinutes() === mm;
      });
    }
  }

  return candidates;
}

export default {
  cancelOneMeeting,
  listRemainingMeetingsForToday,
  cancelTodaysRemaining,
  rescheduleOneMeeting,
  pushTodaysRemaining,
  findMyMeetings,
  sendMeetingInviteEmail
};
