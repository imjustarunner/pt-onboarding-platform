import pool from '../config/database.js';
import User from '../models/User.model.js';
import GoogleCalendar from './googleCalendar.service.js';
import { resolveMeetingRecipient } from './meetingRecipientIdentity.service.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';

// Repair missing invitations on resend and use the same event when rescheduling.
export async function syncHiringInterviewCalendar(interview, { notify = true } = {}) {
  const db = await pool.getConnection();
  const lock = `interview-calendar:${interview.id}`;
  let acquired = false;
  try {
    const [[result]] = await db.execute('SELECT GET_LOCK(?,10) acquired', [lock]);
    if (!result.acquired) throw new Error('Calendar update is already in progress.');
    acquired = true;
    const [[event]] = await db.execute('SELECT e.*, h.calendar_sender_email AS calendar_owner_email, h.status AS interview_status, h.guest_access_ended_at AS guest_ended_at FROM provider_schedule_events e JOIN hiring_interviews h ON h.provider_schedule_event_id=e.id WHERE e.id=? AND e.agency_id=? AND h.id=?', [interview.provider_schedule_event_id, interview.agency_id, interview.id]);
    if (!event || event.meeting_subtype !== 'interview' || event.status !== 'ACTIVE' || event.meeting_completed_at || event.guest_ended_at || interview.guest_access_ended_at || ['completed','cancelled'].includes(event.interview_status || interview.status)) throw new Error('This interview is no longer open.');
    const [attendees] = await db.execute('SELECT user_id FROM provider_schedule_event_attendees WHERE event_id=?', [event.id]);
    const ids = [...new Set([event.provider_id, ...attendees.map(a=>a.user_id), interview.candidate_user_id].map(Number))];
    const users = await Promise.all(ids.map(id=>User.findById(id)));
    if (users.some(user=>!user)) throw new Error('An interview participant could not be found.');
    const people = await Promise.all(users.map(user=>resolveMeetingRecipient({agencyId:event.agency_id,user,guest:Number(user.id)===Number(interview.candidate_user_id)})));
    if (people.some(person=>!person.email)) throw new Error('Every interview participant needs an email address.');
    const host = people[ids.indexOf(Number(event.provider_id))];
    // Email From stays tenant PO; Calendar must impersonate a real calendar owner.
    const subjectEmail = event.google_event_id ? event.calendar_owner_email || interview.calendar_sender_email || host.calendarAccountEmail : host.calendarAccountEmail;
    const calendar = GoogleCalendar.buildCalendarClientForSubject(subjectEmail);
    const eventId = event.google_event_id || `hiring${Number(event.agency_id)}e${Number(event.id)}`;
    let existing = null;
    try { existing = (await calendar.events.get({calendarId:'primary',eventId})).data; }
    catch(error) { if (Number(error.code || error.response?.status)!==404) throw error; }
    if (existing?.status === 'cancelled') throw new Error('The Google invitation was cancelled. Schedule a new interview instead.');
    const description = [`Join interview: ${interview.public_join_url}`, 'Interviewers: sign in with your staff account to open the private workspace.', '', 'Participants:', ...people.map(p=>`${p.displayName} <${p.email}>`)].join('\n');
    const requestBody = {
      summary:event.title, description, visibility:'private', colorId:'3',
      start:{dateTime:parseUtcDate(event.start_at).toISOString(),timeZone:event.event_timezone || 'America/Denver'},
      end:{dateTime:parseUtcDate(event.end_at).toISOString(),timeZone:event.event_timezone || 'America/Denver'},
      attendees:people.map(p=>{
        const previous=existing?.attendees?.find(a=>[p.email,p.calendarAccountEmail].includes(a.email?.toLowerCase()));
        return {email:p.email,displayName:p.displayName,...(previous?.responseStatus?{responseStatus:previous.responseStatus}:{})};
      }),
      extendedProperties:{private:{...(existing?.extendedProperties?.private||{}),pt_kind:'PROVIDER_SCHEDULE_EVENT',pt_schedule_event_kind:'TEAM_MEETING',pt_interview_id:String(interview.id)}},
      reminders:{useDefault:false,overrides:[]}
    };
    const response = existing
      ? await calendar.events.patch({calendarId:'primary',eventId,requestBody,sendUpdates:notify?'all':'none'})
      : await calendar.events.insert({calendarId:'primary',requestBody:{id:eventId,...requestBody},sendUpdates:notify?'all':'none'});
    const saved=response.data;
    await db.execute('UPDATE provider_schedule_events SET google_event_id=?,google_html_link=? WHERE id=?',[saved.id,saved.htmlLink||null,event.id]);
    await db.execute('UPDATE hiring_interviews SET calendar_sender_email=? WHERE id=?',[subjectEmail,interview.id]);
    return {ok:true,eventId:saved.id,htmlLink:saved.htmlLink,attendees:people.map(({email,displayName})=>({email,displayName}))};
  } catch(error) {
    return {ok:false,error:error.message || 'Google Calendar invitation could not be updated.'};
  } finally {
    if (acquired) await db.execute('SELECT RELEASE_LOCK(?)',[lock]);
    db.release();
  }
}
