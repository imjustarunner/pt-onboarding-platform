import pool from '../config/database.js';
import { tenantMeetingBase } from '../utils/tenantMeetingUrl.js';
import { joinUrlForSupervision, joinUrlForTeamMeeting } from '../utils/joinToken.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';

// Only the host/cofacilitator or current invitees receive prompts. Administrative
// access alone must not advertise every tenant's meetings to an administrator.
export async function activeMeetingPrompts(userId) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0) return [];
  const member = (alias) => `EXISTS (SELECT 1 FROM users u WHERE u.id=?
    AND UPPER(COALESCE(u.status,'')) NOT IN ('INACTIVE','INACTIVE_EMPLOYEE','ARCHIVED','TERMINATED','DELETED')
    AND (u.role IN ('super_admin','superadmin') OR EXISTS (SELECT 1 FROM user_agencies ua
      WHERE ua.user_id=u.id AND ua.agency_id=${alias}.agency_id AND ua.is_active=1)))`;
  const [team] = await pool.execute(`SELECT p.id,p.agency_id,p.title,p.start_at,p.end_at,p.platform_video_link,p.google_meet_link,p.provider_id,p.waiting_room_enabled,
    COALESCE(p.participant_join_token,p.join_token) AS join_token,
    'team_meeting' AS meeting_type,
    EXISTS(SELECT 1 FROM provider_schedule_event_join_presence mine WHERE mine.event_id=p.id AND mine.join_identity=?) AS previously_joined
    FROM provider_schedule_events p JOIN agencies org ON org.id=p.agency_id AND org.is_active=1
    WHERE p.kind IN ('TEAM_MEETING','HUDDLE') AND p.status='ACTIVE' AND p.meeting_completed_at IS NULL
      AND (COALESCE(p.platform_video_link,1)=1 OR NULLIF(TRIM(p.google_meet_link),'') IS NOT NULL)
      AND (p.provider_id=? OR EXISTS(SELECT 1 FROM provider_schedule_event_attendees a WHERE a.event_id=p.id AND a.user_id=?))
      AND ${member('p')}
      AND p.start_at <= DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 MINUTE)
      AND (p.end_at >= UTC_TIMESTAMP()
        OR EXISTS(SELECT 1 FROM provider_schedule_event_join_presence live WHERE live.event_id=p.id AND live.left_at IS NULL AND live.last_seen_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 90 SECOND)))
    ORDER BY p.start_at DESC`,[`user-${uid}`,uid,uid,uid]);
  const [supervision] = await pool.execute(`SELECT s.id,s.agency_id,'Supervision' AS title,s.start_at,s.end_at,s.supervisor_user_id,s.co_facilitator_user_id,s.waiting_room_enabled,
    COALESCE(s.participant_join_token,s.join_token) AS join_token,'supervision' AS meeting_type,
    EXISTS(SELECT 1 FROM supervision_session_join_presence mine WHERE mine.session_id=s.id AND mine.join_identity=?) AS previously_joined
    FROM supervision_sessions s JOIN agencies org ON org.id=s.agency_id AND org.is_active=1
    WHERE s.status IN ('SCHEDULED','IN_PROGRESS') AND s.live_ended_at IS NULL
      AND UPPER(COALESCE(s.modality,'')) NOT IN ('IN_PERSON','IN-PERSON')
      AND (s.supervisor_user_id=? OR s.co_facilitator_user_id=? OR s.supervisee_user_id=?
        OR EXISTS(SELECT 1 FROM supervision_session_attendees a WHERE a.session_id=s.id AND a.user_id=? AND a.status NOT IN ('DECLINED','REMOVED','CANCELLED','WITHDRAWN')))
      AND ${member('s')}
      AND s.start_at <= DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 MINUTE)
      AND (s.end_at>=UTC_TIMESTAMP() OR EXISTS(SELECT 1 FROM supervision_session_join_presence live WHERE live.session_id=s.id AND live.left_at IS NULL AND live.last_seen_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 90 SECOND)))
    ORDER BY s.start_at DESC`,[`user-${uid}`,uid,uid,uid,uid,uid]);
  // Query presence only for meetings this user is authorized to see.
  const presence = new Map();
  for (const [kind, meetings, table, key, admissions] of [
    ['team_meeting', team, 'provider_schedule_event_join_presence', 'event_id', 'provider_schedule_event_video_admissions'],
    ['supervision', supervision, 'supervision_session_join_presence', 'session_id', 'supervision_session_video_admissions']
  ]) {
    if (!meetings.length) continue;
    const [live] = await pool.execute(`SELECT p.${key} AS meeting_id,p.join_identity,p.display_name,p.joined_at,
      EXISTS(SELECT 1 FROM ${admissions} a WHERE a.${key}=p.${key}
        AND (BINARY a.join_identity=BINARY p.join_identity OR BINARY CONCAT('user-',a.user_id)=BINARY p.join_identity)) AS admitted
      FROM ${table} p WHERE p.${key} IN (${meetings.map(() => '?').join(',')})
        AND p.left_at IS NULL AND p.last_seen_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 90 SECOND)
      ORDER BY p.joined_at DESC`, meetings.map(row => row.id));
    for (const row of live || []) {
      const k = `${kind}:${row.meeting_id}`;
      if (!presence.has(k)) presence.set(k, []);
      presence.get(k).push(row);
    }
  }
  const bases = new Map();
  return Promise.all([...team,...supervision].map(async row => {
    if (!bases.has(row.agency_id)) bases.set(row.agency_id,tenantMeetingBase(row.agency_id));
    const base = await bases.get(row.agency_id);
    const live = presence.get(`${row.meeting_type}:${row.id}`) || [];
    const hosts = [row.provider_id, row.supervisor_user_id, row.co_facilitator_user_id].filter(Boolean).map(id => `user-${id}`);
    const waitingCount = Number(row.waiting_room_enabled ?? 1) === 1
      ? live.filter(p => !Number(p.admitted) && !hosts.includes(p.join_identity)).length : 0;
    const latest = live.find(p => p.join_identity !== `user-${uid}`);
    const joinedAt = latest && parseUtcDate(latest.joined_at)?.toISOString();
    return { id: row.id, key: `${row.meeting_type}:${row.id}`, title: row.title || 'Meeting',
      presentCount: live.length, waitingCount,
      latestJoin: joinedAt ? { key: `${latest.join_identity}:${joinedAt}`, displayName: latest.display_name || 'A participant', joinedAt } : null,
      meetingType: row.meeting_type, startAt: parseUtcDate(row.start_at)?.toISOString(),
      isLive: parseUtcDate(row.start_at) <= new Date(), previouslyJoined: !!Number(row.previously_joined),
      joinUrl: row.meeting_type !== 'supervision' && row.platform_video_link != null && !Number(row.platform_video_link) && row.google_meet_link
        ? row.google_meet_link : (row.meeting_type==='supervision' ? joinUrlForSupervision : joinUrlForTeamMeeting)(base,row.join_token || row.id) };
  }));
}
