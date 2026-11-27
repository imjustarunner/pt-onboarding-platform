import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import { queueHiringNotification } from './hiringNotification.service.js';
import { tenantInterviewJoinUrl } from '../utils/tenantMeetingUrl.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';

export async function queueInterviewHiringText({ agencyId, userId, interviewId, startsAt }, db = pool) {
  const [[preference]] = await db.execute('SELECT consent_request_id FROM hire_communication_preferences WHERE user_id=? AND agency_id=?', [userId, agencyId]);
  const start = parseUtcDate(startsAt);
  if (!start || Number.isNaN(start.getTime())) throw new Error('Interview notification requires its persisted start time.');
  await queueHiringNotification({ agencyId, userId, type: 'interview_scheduled', emailAlreadyHandled: true,
    key: `interview_scheduled:${Number(interviewId)}:${start.toISOString()}:consent-${preference?.consent_request_id || 'none'}` }, db);
}
export async function queueFutureHiringInterviews(agencyId,userId,db=pool){
  const [interviews]=await db.execute(`SELECT h.id,h.interview_starts_at,h.provider_schedule_event_id FROM hiring_interviews h
    JOIN provider_schedule_events e ON e.id=h.provider_schedule_event_id AND e.agency_id=h.agency_id
    WHERE h.agency_id=? AND h.candidate_user_id=? AND h.status IN ('scheduled','in_progress')
      AND h.guest_access_ended_at IS NULL AND e.status='ACTIVE' AND e.notify_participants=1 AND e.meeting_completed_at IS NULL AND e.start_at>UTC_TIMESTAMP()`,[agencyId,userId]);
  for(const interview of interviews){
    await db.execute("UPDATE provider_schedule_events SET meeting_settings_json=JSON_SET(COALESCE(meeting_settings_json,JSON_OBJECT()),'$.interviewSmsReminders',CAST('true' AS JSON)) WHERE id=? AND agency_id=? AND JSON_EXTRACT(meeting_settings_json,'$.interviewSmsReminders') IS NULL",[interview.provider_schedule_event_id,agencyId]);
    await queueInterviewHiringText({agencyId,userId,interviewId:interview.id,startsAt:interview.interview_starts_at},db);
  }
}
export async function queueReferenceHiringText({ agencyId, userId, requestIds, referenceIndex, method = 'online', completed = false }, db = pool) {
  const identity = completed ? `${method}:${referenceIndex}` : [...requestIds].map(Number).sort((a,b)=>a-b).join(',');
  const key = createHash('sha256').update(identity).digest('hex');
  await queueHiringNotification({ agencyId, userId, type: completed ? 'reference_completed' : 'references_requested',
    key: `${completed ? 'reference_completed' : 'references_requested'}:${key}`, emailAlreadyHandled: true }, db);
}
export async function interviewNotificationDetails(event, db = pool) {
  const match = /^interview_scheduled:(\d+):(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z):consent-(?:\d+|none)$/.exec(event.event_key || '');
  if (!match) return null;
  const expected = parseUtcDate(match[2]).toISOString().slice(0,19).replace('T',' ');
  const [[interview]] = await db.execute(`SELECT h.id,h.guest_join_token,e.start_at,e.event_timezone FROM hiring_interviews h
    JOIN provider_schedule_events e ON e.id=h.provider_schedule_event_id AND e.agency_id=h.agency_id
    WHERE h.id=? AND h.agency_id=? AND h.candidate_user_id=? AND h.status IN ('scheduled','in_progress')
      AND h.guest_access_ended_at IS NULL AND e.status='ACTIVE' AND e.notify_participants=1 AND e.meeting_completed_at IS NULL
      AND e.start_at>UTC_TIMESTAMP() AND e.start_at=?`, [Number(match[1]), event.agency_id, event.user_id, expected]);
  if (!interview?.guest_join_token) return null;
  const zone = interview.event_timezone || 'America/Denver';
  const when = new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:zone}).format(parseUtcDate(interview.start_at));
  const link = await tenantInterviewJoinUrl(event.agency_id,interview.guest_join_token);
  return { text: `Your interview is scheduled for ${when} (${zone}). Join: ${link}.`, interviewId: interview.id, startAt: interview.start_at };
}
