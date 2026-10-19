import pool from '../config/database.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { getSupervisionSignupWindow } from './supervisionSignupWindow.js';

// Invitations are personal. A broad admin role is never a substitute for an
// active agency membership when showing an open training or signup opportunity.
const staffMembership = (alias, invitedAudience = false) => `EXISTS (SELECT 1 FROM user_agencies ua JOIN users u ON u.id=ua.user_id
  WHERE ua.user_id=? AND ua.is_active=1 AND (ua.agency_id=${alias}.agency_id${invitedAudience ? ` OR (a.user_id IS NOT NULL AND JSON_CONTAINS(JSON_EXTRACT(${alias}.meeting_settings_json,'$.audienceAgencyIds'),CAST(ua.agency_id AS JSON)))` : ''})
  AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 AND COALESCE(u.is_demo,0)=0
  AND u.role IS NOT NULL AND u.role NOT IN ('client','client_guardian','guardian','parent','family_member','school_staff','school_support','school_admin','school','kiosk','prehire','candidate')
  AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE','ACTIVE_EMPLOYEE','ONBOARDING'))`;

export async function upcomingMeetingInvitations(userId, now = new Date()) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0) return [];
  const [trainings] = await pool.execute(`SELECT e.id,e.agency_id,e.title,e.start_at,e.end_at,e.event_timezone,
    t.series_key,COALESCE(p.is_required,0) is_required,COALESCE(p.rsvp,'pending') rsvp
    FROM scheduled_trainings t JOIN provider_schedule_events e ON e.id=t.event_id
    JOIN agencies org ON org.id=e.agency_id AND org.is_active=1
    LEFT JOIN meeting_participant_preferences p ON p.event_id=e.id AND p.user_id=?
    WHERE e.status='ACTIVE' AND e.meeting_completed_at IS NULL
      AND e.start_at>UTC_TIMESTAMP() AND e.start_at<DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 DAY)
      AND e.provider_id<>? AND COALESCE(p.is_cohost,0)=0 AND COALESCE(p.rsvp,'pending')='pending'
      AND (t.agency_visible=1 OR EXISTS(SELECT 1 FROM provider_schedule_event_attendees a WHERE a.event_id=e.id AND a.user_id=?))
      AND ${staffMembership('e')}
    ORDER BY e.start_at LIMIT 120`, [uid, uid, uid, uid]);
  const [supervisions] = await pool.execute(`SELECT s.*,a.status attendee_status,COALESCE(a.is_required,0) is_required,
    EXISTS(SELECT 1 FROM supervision_session_presenters p WHERE p.session_id=s.id AND p.user_id=?) is_presenter
    FROM supervision_sessions s JOIN agencies org ON org.id=s.agency_id AND org.is_active=1
    LEFT JOIN supervision_session_attendees a ON a.session_id=s.id AND a.user_id=?
    WHERE s.session_type='group' AND s.status='SCHEDULED' AND s.live_ended_at IS NULL
      AND s.start_at>UTC_TIMESTAMP() AND s.start_at<DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 DAY)
      AND s.supervisor_user_id<>? AND COALESCE(s.co_facilitator_user_id,0)<>?
      AND ((a.user_id IS NOT NULL AND a.status='INVITED') OR (s.enrollment_mode='signup_only' AND a.user_id IS NULL))
      AND ${staffMembership('s',true)}
    ORDER BY s.start_at LIMIT 120`, [uid, uid, uid, uid, uid]);
  const seenTrainings = new Set();
  const prompts = trainings.filter(row => {
    const key = row.series_key || row.id;
    if (seenTrainings.has(key)) return false;
    seenTrainings.add(key); return true;
  }).map(row => ({ ...prompt(row, 'training'), required: Number(row.is_required) === 1 }));
  for (const row of supervisions) {
    const signupOnly = row.enrollment_mode === 'signup_only';
    const window = signupOnly ? getSupervisionSignupWindow(row, now) : {};
    if (signupOnly && window.signupState !== 'open') continue;
    prompts.push({ ...prompt(row, 'supervision'), title: row.title || 'Group supervision',
      required: !signupOnly && (Number(row.is_required) === 1 || Number(row.is_presenter) === 1),
      signupOnly, ...window });
  }
  return prompts.sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
}

function prompt(row, type) {
  return { id: Number(row.id), key: `${type}:${row.id}`, type, agencyId: Number(row.agency_id),
    title: row.title || 'Training', startAt: parseUtcDate(row.start_at)?.toISOString(),
    endAt: parseUtcDate(row.end_at)?.toISOString(), timeZone: row.event_timezone || 'America/Denver' };
}
