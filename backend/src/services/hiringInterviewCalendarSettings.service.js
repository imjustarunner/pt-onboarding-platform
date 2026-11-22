import pool from '../config/database.js';
import { normalizeMeetingSettings, defaultMeetingSettings, parseMeetingSettings } from './meetingSettingsPolicy.js';
import { ACTIVE_EMPLOYEE_SQL } from '../utils/staffEligibility.js';
import { canAccessHiringInterview } from './hiringInterviewAccess.service.js';
import { personalMeetingInvitation } from './meetingInvitations.service.js';
import { resolveInterviewSender } from './hiringInterviewSender.service.js';
import { syncHiringInterviewCalendar } from './hiringInterviewCalendar.service.js';
import { prepareInterviewSmsConsent, recordInterviewSmsConsent, interviewSmsProgram } from './hiringInterviewSms.service.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';

const fail = (status, message) => Object.assign(new Error(message), { status });

export async function updateHiringInterviewCalendar({ interview, event, input, actor }) {
  const addIds = input.addInterviewerIds ?? [];
  if (!Array.isArray(addIds) || addIds.length > 20 || addIds.some(id => !Number.isSafeInteger(id) || id <= 0 || id === Number(interview.candidate_user_id))) {
    throw fail(400, 'Choose up to 20 staff interviewers.');
  }
  for (const key of ['emailReminders', 'smsReminders']) {
    if (input[key] !== undefined && typeof input[key] !== 'boolean') throw fail(400, 'Choose valid reminder channels.');
  }
  for (const id of new Set(addIds)) {
    const [[staff]] = await pool.execute(`SELECT 1 FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=?
      WHERE u.id=? AND ${ACTIVE_EMPLOYEE_SQL}`, [interview.agency_id, id]);
    if (!staff || !await canAccessHiringInterview({ id }, { ...interview, interviewer_user_ids_json: [id] })) {
      throw fail(400, 'Choose active interviewers from the hiring agency.');
    }
  }
  if (addIds.length) await resolveInterviewSender(interview.agency_id);
  const consent = await prepareInterviewSmsConsent(interview.agency_id, input.smsConsent, actor.id);
  if (input.smsReminders === true && !(await interviewSmsProgram(interview.agency_id)).available) {
    throw fail(409, 'Plotline text reminders are pending SMS campaign activation.');
  }

  const db = await pool.getConnection();
  let newlyAdded, settings;
  try {
    await db.beginTransaction();
    const [[current]] = await db.execute('SELECT * FROM provider_schedule_events WHERE id=? AND agency_id=? FOR UPDATE', [event.id, interview.agency_id]);
    const [[hiring]] = await db.execute('SELECT status,guest_access_ended_at,interviewer_user_ids_json FROM hiring_interviews WHERE id=? AND provider_schedule_event_id=? FOR UPDATE', [interview.id,event.id]);
    if (!current || current.status !== 'ACTIVE' || current.meeting_completed_at || parseUtcDate(current.start_at) <= new Date()
      || !hiring || !['scheduled', 'in_progress'].includes(hiring.status) || hiring.guest_access_ended_at) throw fail(409, 'This interview is no longer open for schedule changes.');
    const [existing] = await db.execute('SELECT user_id FROM provider_schedule_event_attendees WHERE event_id=?', [event.id]);
    const ids = new Set([Number(event.provider_id), ...existing.map(row => Number(row.user_id))]);
    newlyAdded = [...new Set(addIds)].filter(id => !ids.has(id));
    for (const id of newlyAdded) {
      await db.execute('INSERT INTO provider_schedule_event_attendees (event_id,user_id) VALUES (?,?)', [event.id, id]);
      await personalMeetingInvitation(current, id, { queue: true, executor: db });
      ids.add(id);
    }
    if (newlyAdded.length) {
      await db.execute('UPDATE hiring_interviews SET interviewer_user_ids_json=? WHERE id=?', [JSON.stringify([...ids]), interview.id]);
      await db.execute('UPDATE hiring_profiles SET interview_interviewer_user_ids=? WHERE id=? AND interview_starts_at=?',
        [JSON.stringify([...ids]), interview.hiring_profile_id, current.start_at]);
    }
    const previous = parseMeetingSettings(current.meeting_settings_json);
    settings = normalizeMeetingSettings({ reminders: input.reminders }, { ...defaultMeetingSettings('interview'), ...previous });
    if (input.emailReminders !== undefined) settings.interviewEmailReminders = input.emailReminders;
    if (input.smsReminders !== undefined) settings.interviewSmsReminders = input.smsReminders;
    if (settings.interviewSmsReminders && input.smsReminders !== undefined && !consent) {
      const [[proof]] = await db.execute('SELECT id FROM hiring_interview_sms_consents WHERE interview_id=? ORDER BY id DESC LIMIT 1', [interview.id]);
      if (!proof) throw fail(400, 'Record verbal consent before turning on interview texts.');
    }
    await recordInterviewSmsConsent(db, interview.id, consent);
    await db.execute('UPDATE provider_schedule_events SET meeting_settings_json=?, updated_by_user_id=? WHERE id=?',
      [JSON.stringify(settings), actor.id, event.id]);
    await db.commit();
  } catch (error) {
    await db.rollback();
    throw error;
  } finally { db.release(); }
  if (!newlyAdded.length) return { added: 0 };
  // The personal invitation is queued only for new staff. Existing interviewers
  // and the candidate keep their existing invitation and RSVP.
  const calendar = await syncHiringInterviewCalendar(interview, { notify: false });
  return { added: newlyAdded.length, calendarWarning: calendar.ok ? null : calendar.error };
}
