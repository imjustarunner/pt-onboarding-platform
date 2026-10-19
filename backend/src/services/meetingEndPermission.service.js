import pool from '../config/database.js';

function schema(type) {
  if (type === 'supervision') return {
    table: 'supervision_sessions', ended: 'live_ended_at', endedBy: 'live_ended_by_user_id',
    hosts: 'u.id=e.supervisor_user_id',
    denied: 'Only the assigned supervisor can end this meeting for everyone.'
  };
  if (type === 'team-meeting') return {
    table: 'provider_schedule_events', ended: 'meeting_completed_at', endedBy: 'meeting_completed_by_user_id',
    hosts: `(u.id=e.provider_id OR EXISTS (
      SELECT 1 FROM meeting_participant_preferences pref
      JOIN provider_schedule_event_attendees a ON a.event_id=pref.event_id AND a.user_id=pref.user_id
      WHERE pref.event_id=e.id AND pref.user_id=u.id AND pref.is_cohost=1))`,
    denied: 'Only the host or a cohost can end this meeting for everyone.'
  };
  throw new Error('Unsupported meeting type');
}
function authorizedHost(s) {
  return `EXISTS (SELECT 1 FROM users u WHERE u.id=? AND ${s.hosts}
    AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0
    AND COALESCE(u.is_demo,0)=0
    AND UPPER(COALESCE(u.status,'')) NOT IN ('INACTIVE','INACTIVE_EMPLOYEE','ARCHIVED','TERMINATED','DELETED')
    AND EXISTS (SELECT 1 FROM agencies org WHERE org.id=e.agency_id AND org.is_active=1
      AND (u.role IN ('super_admin','superadmin') OR EXISTS (
        SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.agency_id=org.id AND ua.is_active=1))))`;
}
export async function meetingEndPermission(type, eventId, actorUserId) {
  const s = schema(type);
  const [rows] = await pool.execute(`SELECT e.id FROM ${s.table} e
    WHERE e.id=? AND e.${s.ended} IS NULL AND ${authorizedHost(s)}`, [eventId, actorUserId]);
  const canEndForEveryone = rows.length > 0;
  return { canEndForEveryone, endMeetingReason: canEndForEveryone ? '' : s.denied };
}
export async function assertMeetingEndAllowed(type, eventId, actorUserId) {
  const permission = await meetingEndPermission(type, eventId, actorUserId);
  if (!permission.canEndForEveryone) throw Object.assign(new Error(permission.endMeetingReason), {
    status: 403, code: 'MEETING_END_FORBIDDEN'
  });
  return permission;
}
export async function closeMeetingAsHost(type, eventId, actorUserId) {
  const s = schema(type);
  // Recheck the persisted host assignment and active membership in the closing
  // write. Other hosts may stay connected; their presence does not remove the
  // assigned host's authority to end the meeting after explicit confirmation.
  const [result] = await pool.execute(`UPDATE ${s.table} e
    SET ${s.ended}=UTC_TIMESTAMP(), ${s.endedBy}=?, updated_at=CURRENT_TIMESTAMP${type === 'team-meeting' ? ', updated_by_user_id=?' : ''}
    WHERE e.id=? AND e.${s.ended} IS NULL AND ${authorizedHost(s)}`,
  [actorUserId, ...(type === 'team-meeting' ? [actorUserId] : []), eventId, actorUserId]);
  if (!result.affectedRows) throw Object.assign(new Error('The meeting has ended or your permission to end it has changed.'), {
    status: 409, code: 'MEETING_END_UNAVAILABLE'
  });
}
