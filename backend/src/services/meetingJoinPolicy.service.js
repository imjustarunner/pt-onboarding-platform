import pool from '../config/database.js';

// Room access follows the current account and roster, never the role of a URL.
export async function hasActiveMeetingMembership(agencyId, userId) {
  if (!Number(userId) || !Number(agencyId)) return false;
  const [rows] = await pool.execute(`SELECT 1 FROM users u JOIN agencies org ON org.id=? AND org.is_active=1
    WHERE u.id=? AND COALESCE(u.is_active,1)=1
      AND UPPER(COALESCE(u.status,'')) NOT IN ('INACTIVE','INACTIVE_EMPLOYEE','ARCHIVED','TERMINATED','DELETED')
      AND (u.role IN ('super_admin','superadmin') OR EXISTS (
        SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.agency_id=org.id AND ua.is_active=1))
    LIMIT 1`, [agencyId, userId]);
  return !!rows?.length;
}

export async function canJoinTeamMeeting(event, userId) {
  if (!await hasActiveMeetingMembership(event.agency_id, userId)) return false;
  if (Number(event.provider_id) === Number(userId)) return true;
  const [rows] = await pool.execute(
    'SELECT 1 FROM provider_schedule_event_attendees WHERE event_id=? AND user_id=? LIMIT 1',
    [event.id, userId]
  );
  return !!rows?.length;
}

export async function canJoinSupervision(session, userId, matchesOpenAudience) {
  if (!await hasActiveMeetingMembership(session.agency_id, userId)) return false;
  if ([session.supervisor_user_id, session.co_facilitator_user_id]
    .some(id => Number(id) === Number(userId))) return true;
  const [attendees] = await pool.execute(
    'SELECT status FROM supervision_session_attendees WHERE session_id=? AND user_id=? LIMIT 1',
    [session.id, userId]
  );
  if (attendees?.length) {
    return !['DECLINED','REMOVED','CANCELLED','WITHDRAWN'].includes(String(attendees[0].status || '').toUpperCase());
  }
  if (Number(session.supervisee_user_id) === Number(userId)) return true;
  const [presenters] = await pool.execute(
    'SELECT 1 FROM supervision_session_presenters WHERE session_id=? AND user_id=? LIMIT 1',
    [session.id, userId]
  );
  return !!presenters?.length || !!(matchesOpenAudience && await matchesOpenAudience({ sessionRow: session, userId }));
}

export function roomUnavailable(row, type = 'team') {
  const supervision = type === 'supervision';
  const status = String(row.status || '').toUpperCase();
  if (['CANCELLED','RESCHEDULED','MISSED','FINALIZED','COMPLETED'].includes(status)
    || (supervision ? row.live_ended_at : row.meeting_completed_at)) {
    return { status: 410, error: { message: 'This meeting has ended or is no longer available.' } };
  }
  if (supervision ? ['IN_PERSON', 'IN-PERSON'].includes(String(row.modality || '').toUpperCase())
    : row.platform_video_link != null && !Number(row.platform_video_link)) {
    return { status: 400, error: { message: 'This meeting does not use a platform video room. Open it from your calendar or personal invitation.' } };
  }
  return null;
}

export function requirePersonalSupervisionInvitation(req, res) {
  return res.status(401).json({ requiresSignIn: true,
    error: { message: 'Please sign in and open this session from your calendar or personal invitation.' } });
}
