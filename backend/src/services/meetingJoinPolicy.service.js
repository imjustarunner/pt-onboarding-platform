import pool from '../config/database.js';
import { parseMeetingSettings } from './meetingSettingsPolicy.js';
import { isAuricwellQaAgency, allowQaExchangeRecipient } from '../utils/auricwellQaPolicy.js';

// Room access follows the current account and roster, never the role of a URL.
// Shared by access checks and agenda scope discovery. A directory affiliation is
// not sufficient to open a private office; inactive organizations remain excluded.
const activeMeetingMembershipSql = `COALESCE(u.is_active,1)=1
      AND COALESCE(u.is_demo,0)=0 AND COALESCE(u.is_archived,0)=0
      AND UPPER(COALESCE(u.status,'')) NOT IN ('INACTIVE','INACTIVE_EMPLOYEE','ARCHIVED','TERMINATED','DELETED')
      AND (u.role IN ('super_admin','superadmin') OR EXISTS (
        SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.agency_id=org.id AND ua.is_active=1))`;

// Synthetic clinicians can exercise supervision only in the verified QA agency.
// Keep the general demo exclusion and require the same explicit provider roster
// used for QA assignment notifications, plus a current agency membership.
async function hasQaMeetingMembership(agencyId, userId) {
  if (Number(agencyId) !== 450) return false;
  const [[row]] = await pool.execute(`SELECT org.id AS agency_id,org.slug,org.feature_flags,
    org.is_active AS agency_active,org.is_archived AS agency_archived,
    u.id,u.email,u.role,u.status,u.is_demo,u.is_active,u.is_archived
    FROM agencies org JOIN user_agencies ua ON ua.agency_id=org.id AND ua.is_active=1
    JOIN users u ON u.id=ua.user_id WHERE org.id=? AND u.id=? LIMIT 1`, [450,userId]);
  return !!row && Number(row.agency_active) === 1 && !Number(row.agency_archived)
    && Number(row.is_active) === 1 && !Number(row.is_archived) && Number(row.is_demo) === 1
    && row.status === 'ACTIVE_EMPLOYEE'
    && ['provider','provider_plus','supervisor','intern','intern_plus'].includes(row.role)
    && isAuricwellQaAgency({ id:row.agency_id,slug:row.slug,feature_flags:row.feature_flags })
    && allowQaExchangeRecipient({ slug:row.slug,feature_flags:row.feature_flags },row);
}

export async function activeMeetingAgencyIds(agencyIds, userId) {
  const ids=[...new Set((agencyIds || []).map(Number).filter(id=>Number.isSafeInteger(id)&&id>0))];
  if(!ids.length || !Number(userId))return [];
  const [rows]=await pool.execute(`SELECT org.id FROM agencies org JOIN users u ON u.id=?
    WHERE org.id IN (${ids.map(()=>'?').join(',')}) AND org.is_active=1
      AND ${activeMeetingMembershipSql}`, [userId,...ids]);
  const allowed = rows.map(row=>Number(row.id));
  if (ids.includes(450) && !allowed.includes(450) && await hasQaMeetingMembership(450,userId)) allowed.push(450);
  return allowed;
}

export async function hasActiveMeetingMembership(agencyId, userId) {
  if (!Number(userId) || !Number(agencyId)) return false;
  const [rows] = await pool.execute(`SELECT 1 FROM users u JOIN agencies org ON org.id=? AND org.is_active=1
    WHERE u.id=? AND ${activeMeetingMembershipSql}
    LIMIT 1`, [agencyId, userId]);
  return !!rows?.length || await hasQaMeetingMembership(agencyId,userId);
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
  if (!await hasActiveSupervisionMembership(session, userId)) return false;
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

// A cross-agency invitation grants access to this session only, never to its
// host tenant. Membership in one of the explicitly authorized agencies is live.
export async function hasActiveSupervisionMembership(session, userId) {
  if (await hasActiveMeetingMembership(session.agency_id, userId)) return true;
  const ids = parseMeetingSettings(session.meeting_settings_json).audienceAgencyIds || [];
  if (!(await activeMeetingAgencyIds(ids, userId)).length) return false;
  const [rows] = await pool.execute(`SELECT 1 FROM supervision_session_attendees a
    JOIN agencies org ON org.id=? AND org.is_active=1 AND COALESCE(org.is_archived,0)=0
    WHERE a.session_id=? AND a.user_id=? AND a.status NOT IN ('REMOVED','CANCELLED','WITHDRAWN') LIMIT 1`, [session.agency_id,session.id,userId]);
  return !!rows.length;
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
