import pool from '../config/database.js';
import { canJoinTeamMeeting } from './meetingJoinPolicy.service.js';

// Registration covers all remaining dates in this training, and only this person's invitations.
export async function saveTrainingRsvp(event, userId, response, reason = '') {
  if (!['accepted', 'declined'].includes(response)) throw Object.assign(new Error('Choose attending or decline.'), {status:400});
  if (event.meeting_subtype !== 'training' || !await canJoinTeamMeeting(event,userId)) throw Object.assign(new Error('You are not invited to this training.'), {status:403});
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
