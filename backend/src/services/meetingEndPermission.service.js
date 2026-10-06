import pool from '../config/database.js';

export const LAST_HOST_MESSAGE = 'Only the last host or cohost still in the room can end it for everyone. Another host may still be connected. Choose Leave only to keep the meeting open.';
function schema(type) {
  if (type === 'supervision') return { table:'supervision_sessions', presence:'supervision_session_join_presence', key:'session_id', ended:'live_ended_at', endedBy:'live_ended_by_user_id', hosts:'u.id IN (e.supervisor_user_id, e.co_facilitator_user_id)' };
  if (type === 'team-meeting') return { table:'provider_schedule_events', presence:'provider_schedule_event_join_presence', key:'event_id', ended:'meeting_completed_at', endedBy:'meeting_completed_by_user_id', hosts:`(u.id=e.provider_id OR EXISTS (
    SELECT 1 FROM meeting_participant_preferences pref
    JOIN provider_schedule_event_attendees a ON a.event_id=pref.event_id AND a.user_id=pref.user_id
    WHERE pref.event_id=e.id AND pref.user_id=u.id AND pref.is_cohost=1))` };
  throw new Error('Unsupported meeting type');
}
function activeHosts(s, includeMeeting = false) {
  // Explicit leaves update last_seen_at and left_at together. Stale-presence
  // cleanup only updates left_at: keep that host protected for a short reconnect
  // grace period, rather than treating a delayed heartbeat as permission to end.
  return `FROM ${s.presence} p${includeMeeting ? ` JOIN ${s.table} e ON e.id=p.${s.key}` : ''} JOIN users u
    ON p.join_identity IN (CONCAT('user-',u.id),CAST(u.id AS CHAR))
    WHERE p.${s.key}=e.id AND ${s.hosts}
      AND (p.left_at IS NULL OR p.last_seen_at < p.left_at)
      AND p.last_seen_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 MINUTE)`;
}
export async function meetingEndPermission(type, eventId, actorUserId) {
  const s=schema(type);
  const [rows]=await pool.execute(`SELECT DISTINCT u.id ${activeHosts(s,true)} AND e.id=? AND e.${s.ended} IS NULL`,[eventId]);
  const ids=[...new Set(rows.map(r=>Number(r.id)).filter(Boolean))];
  const canEndForEveryone=ids.length===1 && ids[0]===Number(actorUserId);
  return {canEndForEveryone,activeHostCount:ids.length,endMeetingReason:canEndForEveryone?'':LAST_HOST_MESSAGE};
}
export async function assertLastMeetingHost(type, eventId, actorUserId) {
  const permission=await meetingEndPermission(type,eventId,actorUserId);
  if (!permission.canEndForEveryone) throw Object.assign(new Error(LAST_HOST_MESSAGE),{status:409,code:'OTHER_HOSTS_PRESENT'});
  return permission;
}
export async function closeMeetingAsLastHost(type, eventId, actorUserId) {
  const s=schema(type);
  // One conditional write rechecks live presence at closure time. No ledger,
  // payroll, summary, or video teardown may run unless this succeeds.
  const [result]=await pool.execute(`UPDATE ${s.table} e
    SET ${s.ended}=UTC_TIMESTAMP(), ${s.endedBy}=?, updated_at=CURRENT_TIMESTAMP${type==='team-meeting'?', updated_by_user_id=?':''}
    WHERE e.id=? AND e.${s.ended} IS NULL
      AND EXISTS (SELECT 1 ${activeHosts(s)} AND u.id=?)
      AND NOT EXISTS (SELECT 1 ${activeHosts(s)} AND u.id<>?)`,[actorUserId,...(type==='team-meeting'?[actorUserId]:[]),eventId,actorUserId,actorUserId]);
  if (!result.affectedRows) throw Object.assign(new Error(LAST_HOST_MESSAGE),{status:409,code:'OTHER_HOSTS_PRESENT'});
}
