import { trainingRegistrationClosesAt } from './trainingRegistrationPolicy.js';
import pool from '../config/database.js';
import { canJoinTeamMeeting } from './meetingJoinPolicy.service.js';

// Registration covers all remaining dates in this training, and only this person's invitations.
export async function saveTrainingRsvp(event, userId, response, reason = '') {
  if (!['accepted', 'declined'].includes(response)) throw Object.assign(new Error('Choose attending or decline.'), {status:400});
  if (event.meeting_subtype !== 'training' || !await canJoinTeamMeeting(event,userId)) throw Object.assign(new Error('You are not invited to this training.'), {status:403});
  if (response === 'accepted') {
    const [[firstDate]] = await pool.execute(`SELECT e.start_at,e.meeting_settings_json FROM scheduled_trainings selected
      JOIN scheduled_trainings series ON series.series_key=selected.series_key JOIN provider_schedule_events e ON e.id=series.event_id
      WHERE selected.event_id=? AND e.status='ACTIVE' ORDER BY e.start_at LIMIT 1`, [event.id]);
    const deadline = trainingRegistrationClosesAt(firstDate?.start_at ? firstDate : event);
    if (Date.parse(deadline) <= Date.now()) throw Object.assign(new Error('Registration for this training has closed.'), {status:409});
  }
  const declineReason = response === 'declined' ? String(reason || '').trim() : '';
  if (declineReason.length > 2000) throw Object.assign(new Error('Keep your reason under 2,000 characters.'), { status: 400 });
  if (response === 'declined') {
    const [preferences] = await pool.execute('SELECT is_required FROM meeting_participant_preferences WHERE event_id=? AND user_id=?', [event.id,userId]);
    if (Number(preferences[0]?.is_required) === 1 && !declineReason) throw Object.assign(new Error('Please explain why you cannot attend this mandatory training.'), { status: 400 });
  }
  const [result] = await pool.execute(`INSERT INTO meeting_participant_preferences (event_id,user_id,rsvp,rsvp_at,rsvp_decline_reason)
    SELECT e.id,?,?,UTC_TIMESTAMP(),? FROM scheduled_trainings t
    JOIN scheduled_trainings selected ON selected.series_key=t.series_key AND selected.event_id=?
    JOIN provider_schedule_events e ON e.id=t.event_id
    WHERE e.status='ACTIVE' AND e.meeting_completed_at IS NULL AND e.end_at>UTC_TIMESTAMP()
      AND (e.provider_id=? OR EXISTS(SELECT 1 FROM provider_schedule_event_attendees a WHERE a.event_id=e.id AND a.user_id=?))
    ON DUPLICATE KEY UPDATE rsvp=VALUES(rsvp),rsvp_at=VALUES(rsvp_at),rsvp_decline_reason=VALUES(rsvp_decline_reason)`, [userId,response,declineReason || null,event.id,userId,userId]);
  return {ok:true,response,updated:result.affectedRows};
}

// Agency-visible training is an optional enrollment opportunity for active staff.
// Registration and preference writes share a lock so a concurrent visibility
// change cannot turn a private training into a self-enrollment opportunity.
export async function saveOpenTrainingRsvp(eventId, userId, response) {
  if (!['accepted', 'declined'].includes(response)) throw Object.assign(new Error('Choose attending or not interested.'), {status:400});
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [events] = await db.execute(`SELECT e.id,e.start_at,e.meeting_settings_json,t.series_key,
      (SELECT MIN(first_event.start_at) FROM scheduled_trainings series JOIN provider_schedule_events first_event ON first_event.id=series.event_id WHERE series.series_key=t.series_key AND first_event.status='ACTIVE') registration_start_at FROM scheduled_trainings t
      JOIN provider_schedule_events e ON e.id=t.event_id
      JOIN agencies org ON org.id=e.agency_id AND org.is_active=1
      JOIN user_agencies ua ON ua.agency_id=e.agency_id AND ua.user_id=? AND ua.is_active=1
      JOIN users u ON u.id=ua.user_id
      WHERE e.id=? AND t.agency_visible=1 AND e.status='ACTIVE' AND e.meeting_completed_at IS NULL AND e.start_at>UTC_TIMESTAMP()
        AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 AND COALESCE(u.is_demo,0)=0
        AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE','ACTIVE_EMPLOYEE','ONBOARDING')
        AND u.role IS NOT NULL AND u.role NOT IN ('client','client_guardian','guardian','parent','family_member','school_staff','school_support','school_admin','school','kiosk','prehire','candidate')
      FOR UPDATE`, [userId,eventId]);
    if (!events[0]) throw Object.assign(new Error('This training is no longer available for registration.'), {status:403});
    if (response === 'accepted' && Date.parse(trainingRegistrationClosesAt(events[0])) <= Date.now()) throw Object.assign(new Error('Registration for this training has closed.'), {status:409});
    const [dates] = await db.execute(`SELECT e.id,COALESCE(p.is_required,0) is_required FROM scheduled_trainings t
      JOIN provider_schedule_events e ON e.id=t.event_id
      LEFT JOIN meeting_participant_preferences p ON p.event_id=e.id AND p.user_id=?
      WHERE t.series_key=? AND t.agency_visible=1 AND e.status='ACTIVE' AND e.meeting_completed_at IS NULL AND e.start_at>UTC_TIMESTAMP()
      ORDER BY e.start_at FOR UPDATE`, [userId,events[0].series_key]);
    if (response === 'declined' && dates.some(row => Number(row.is_required) === 1)) throw Object.assign(new Error('Please use your invitation to give a reason for declining mandatory training.'), {status:400});
    for (const row of dates) {
      if (response === 'accepted') await db.execute('INSERT IGNORE INTO provider_schedule_event_attendees (event_id,user_id) VALUES (?,?)', [row.id,userId]);
      await db.execute(`INSERT INTO meeting_participant_preferences (event_id,user_id,is_required,is_cohost,rsvp,rsvp_at)
        VALUES (?,?,0,0,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE rsvp=VALUES(rsvp),rsvp_at=VALUES(rsvp_at),rsvp_decline_reason=NULL`, [row.id,userId,response]);
    }
    await db.commit(); return {ok:true,response,updated:dates.length};
  } catch(error) { await db.rollback(); throw error; }
  finally { db.release(); }
}
