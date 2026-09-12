import pool from '../config/database.js';
import User from '../models/User.model.js';
import ProviderScheduleEvent from '../models/ProviderScheduleEvent.model.js';
import HiringInterview from '../models/HiringInterview.model.js';
import GoogleCalendarService from './googleCalendar.service.js';
import { parseInterviewStart } from './hiringInterviewSchedule.service.js';
import { interviewDate, deliverExistingInterview } from './hiringInterviewDelivery.service.js';
import { canAccessHiringInterview } from './hiringInterviewAccess.service.js';
import { isValidTimeZone } from '../utils/zonedWallTime.util.js';

const sqlDate = d => d.toISOString().slice(0, 19).replace('T', ' ');

export async function rescheduleHiringInterview(interview, body) {
  if (!['scheduled', 'in_progress'].includes(interview.status) || interview.guest_access_ended_at) {
    throw Object.assign(new Error('Only an open interview can be rescheduled.'), { status: 409 });
  }
  const event = await ProviderScheduleEvent.findById(interview.provider_schedule_event_id);
  if (!event || Number(event.agency_id) !== Number(interview.agency_id)) throw Object.assign(new Error('Linked meeting not found'), { status: 409 });
  if (event.meeting_completed_at || String(event.meeting_subtype) !== 'interview') throw Object.assign(new Error('The linked meeting cannot be rescheduled'), { status: 409 });
  if (body.interviewerUserIds !== undefined && !Array.isArray(body.interviewerUserIds)) throw Object.assign(new Error('Choose interviewers from the staff list'), { status: 400 });
  const timezone = body.timezone || interview.interview_timezone || 'America/Denver';
  if (!isValidTimeZone(timezone)) throw Object.assign(new Error('Choose a valid timezone'), { status: 400 });
  const start = body.startsAt ? parseInterviewStart(body.startsAt, timezone)?.startDate : interviewDate(interview.interview_starts_at);
  if (!start || Number.isNaN(start.getTime())) throw Object.assign(new Error('Choose a valid date and time'), { status: 400 });
  const duration = interviewDate(event.end_at) - interviewDate(event.start_at);
  const end = new Date(start.getTime() + (duration > 0 ? duration : 3600000));
  const ids = [...new Set([Number(event.provider_id), ...(body.interviewerUserIds || interview.interviewer_user_ids_json || []).map(Number)])];
  for (const id of ids) {
    if (!await canAccessHiringInterview({ id }, { ...interview, interviewer_user_ids_json: ids })) throw Object.assign(new Error('Interviewers must be active staff in this agency'), { status: 400 });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('UPDATE provider_schedule_events SET start_at = ?, end_at = ?, event_timezone = ? WHERE id = ?', [sqlDate(start), sqlDate(end), timezone, event.id]);
    await conn.execute('DELETE FROM provider_schedule_event_attendees WHERE event_id = ?', [event.id]);
    for (const id of ids.filter(id => id !== Number(event.provider_id))) await conn.execute('INSERT INTO provider_schedule_event_attendees (event_id, user_id) VALUES (?, ?)', [event.id, id]);
    await conn.execute('UPDATE hiring_interviews SET interview_starts_at = ?, interview_timezone = ?, interviewer_user_ids_json = ?, invite_sent_at = NULL WHERE id = ?', [sqlDate(start), timezone, JSON.stringify(ids), interview.id]);
    await conn.execute("UPDATE hiring_profiles SET interview_starts_at = ?, interview_timezone = ?, interview_interviewer_user_ids = ? WHERE candidate_user_id = ?", [sqlDate(start), timezone, JSON.stringify(ids), interview.candidate_user_id]);
    await conn.commit();
  } catch(e) { await conn.rollback(); throw e; } finally { conn.release(); }
  let calendarWarning = null;
  if (event.google_event_id) {
    const owner = await User.findById(event.provider_id);
    const users = await Promise.all([...ids, interview.candidate_user_id].map(id => User.findById(id)));
    const sender = interview.calendar_sender_email || owner?.email;
    // Legacy events belong to a personal calendar. Do not send new mail from that address.
    if (!/^po@/i.test(sender || '')) calendarWarning = 'This older calendar invitation belongs to a staff mailbox. The interview link email has the updated time; update the old calendar invitation separately.';
    else {
      try {
        const result = await GoogleCalendarService.patchEventDetails({ subjectEmail: sender, eventId: event.google_event_id,
          startAt: start.toISOString(), endAt: end.toISOString(), timeZone: timezone,
          description: `Join interview: ${interview.public_join_url}\nInterviewers: sign in with your staff account to open the private workspace.`,
          attendeeEmails: users.map(u => u?.email).filter(Boolean) });
        if (!result?.ok || result.skipped) calendarWarning = 'The interview was updated, but calendar delivery failed.';
      } catch { calendarWarning = 'The interview was updated, but calendar delivery failed.'; }
    }
  } else calendarWarning = 'No connected calendar invitation exists for this interview.';
  const updated = await HiringInterview.findById(interview.id);
  const delivery = await deliverExistingInterview(updated);
  return { interview: await HiringInterview.findById(interview.id), delivery, calendarWarning };
}
