import pool from '../config/database.js';
import { isAuricwellQaAgency, allowQaExchangeRecipient } from '../utils/auricwellQaPolicy.js';

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
// Resolve the same explicit synthetic clinician roster used by meeting joining.
// The closing write also compares this server-read snapshot, so a changed roster
// or account cannot retain authority from a previously displayed End button.
async function qaHostSnapshot(s, eventId, actorUserId) {
  const [[row]] = await pool.execute(`SELECT org.id AS agency_id,org.slug,org.feature_flags,
    u.id,u.email,u.role,u.status,u.is_demo FROM ${s.table} e
    JOIN users u ON ${s.hosts} JOIN agencies org ON org.id=e.agency_id
    JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=org.id AND ua.is_active=1
    WHERE e.id=? AND u.id=? AND org.id=450 AND org.is_active=1 AND COALESCE(org.is_archived,0)=0
      AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND u.is_demo=1
      AND u.status='ACTIVE_EMPLOYEE' LIMIT 1`, [eventId, actorUserId]);
  if (!row || row.status!=='ACTIVE_EMPLOYEE' || !['provider','provider_plus','supervisor','intern','intern_plus'].includes(row.role)
    || !isAuricwellQaAgency({ id:row.agency_id,slug:row.slug,feature_flags:row.feature_flags })
    || !allowQaExchangeRecipient({ slug:row.slug,feature_flags:row.feature_flags },row)) return null;
  return row;
}
function authorizedHost(s, qa) {
  const demo = qa ? `(COALESCE(u.is_demo,0)=0 OR (u.is_demo=1 AND org.id=450
    AND org.slug=? AND JSON_EXTRACT(IF(JSON_VALID(org.feature_flags),org.feature_flags,JSON_OBJECT()),'$')=CAST(? AS JSON) AND u.email=? AND u.role=?
    AND u.status='ACTIVE_EMPLOYEE' AND COALESCE(org.is_archived,0)=0))` : 'COALESCE(u.is_demo,0)=0';
  return `EXISTS (SELECT 1 FROM users u WHERE u.id=? AND ${s.hosts}
    AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0
    AND UPPER(COALESCE(u.status,'')) NOT IN ('INACTIVE','INACTIVE_EMPLOYEE','ARCHIVED','TERMINATED','DELETED')
    AND EXISTS (SELECT 1 FROM agencies org WHERE org.id=e.agency_id AND org.is_active=1
      AND ${demo}
      AND (u.role IN ('super_admin','superadmin') OR EXISTS (
        SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.agency_id=org.id AND ua.is_active=1))))`;
}
const qaBindings = qa => qa ? [qa.slug,typeof qa.feature_flags==='string'?qa.feature_flags:JSON.stringify(qa.feature_flags),qa.email,qa.role] : [];
export async function meetingEndPermission(type, eventId, actorUserId) {
  const s = schema(type);
  const qa = await qaHostSnapshot(s,eventId,actorUserId);
  const [rows] = await pool.execute(`SELECT e.id FROM ${s.table} e
    WHERE e.id=? AND e.${s.ended} IS NULL AND ${authorizedHost(s,qa)}`, [eventId, actorUserId,...qaBindings(qa)]);
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
  const qa = await qaHostSnapshot(s,eventId,actorUserId);
  // Recheck the persisted host assignment and active membership in the closing
  // write. Other hosts may stay connected; their presence does not remove the
  // assigned host's authority to end the meeting after explicit confirmation.
  const [result] = await pool.execute(`UPDATE ${s.table} e
    SET ${s.ended}=UTC_TIMESTAMP(), ${s.endedBy}=?, updated_at=CURRENT_TIMESTAMP${type === 'team-meeting' ? ', updated_by_user_id=?' : ''}
    WHERE e.id=? AND e.${s.ended} IS NULL AND ${authorizedHost(s,qa)}`,
  [actorUserId, ...(type === 'team-meeting' ? [actorUserId] : []), eventId, actorUserId,...qaBindings(qa)]);
  if (!result.affectedRows) throw Object.assign(new Error('The meeting has ended or your permission to end it has changed.'), {
    status: 409, code: 'MEETING_END_UNAVAILABLE'
  });
  // Closing remains authoritative even if the carrier is temporarily unavailable.
  // The durable ended state prevents re-admission; reconciliation retries teardown.
  try { const { endMeetingDialIn } = await import('./meetingDialIn.service.js'); await endMeetingDialIn(type, eventId); }
  catch (error) { console.warn('[meeting-dial-in] Close needs retry', error.code || 'carrier_unavailable'); }
}
