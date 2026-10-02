import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import ProviderScheduleEvent from '../models/ProviderScheduleEvent.model.js';
import HiringInterview from '../models/HiringInterview.model.js';
import { roomUnavailable } from './meetingJoinPolicy.service.js';

const fail = (status, message) => Object.assign(new Error(message), { status });

// This credential identifies the applicant, not a staff session. Never exchange it
// for an app login, and never let a cookie change the identity it represents.
export async function interviewApplicantAccess(ref) {
  if (!/^[\w-]{32}$/.test(String(ref || '')) || /^\d+$/.test(ref)) throw fail(404, 'Interview invitation not found.');
  const event = await ProviderScheduleEvent.resolveByJoinRef(ref);
  if (!event || event.meeting_subtype !== 'interview' || !['TEAM_MEETING', 'HUDDLE'].includes(event.kind)
    || ProviderScheduleEvent.classifyJoinTokenRole(event, ref) !== 'participant') throw fail(404, 'Interview invitation not found.');
  const interview = await HiringInterview.findByScheduleEventId(event.id);
  if (!interview?.candidate_user_id || Number(interview.agency_id) !== Number(event.agency_id)) throw fail(404, 'Interview invitation not found.');
  const unavailable = roomUnavailable(event);
  if (unavailable || interview.guest_access_ended_at || ['completed', 'cancelled'].includes(String(interview.status).toLowerCase())) {
    throw fail(410, 'Your interview has ended or is no longer available.');
  }
  const [agencies] = await pool.execute('SELECT id FROM agencies WHERE id=? AND is_active=1', [event.agency_id]);
  if (!agencies.length) throw fail(404, 'Interview invitation not found.');
  const token = event.participant_join_token || event.join_token;
  return { event, interview, identity: `guest-iv-${createHash('sha256').update(token).digest('hex').slice(0, 16)}` };
}

export async function requireApplicantInRoom({ event, identity }) {
  const waitingRoomEnabled = ![0, false, '0', 'false'].includes(event.waiting_room_enabled);
  const [rows] = await pool.execute(`SELECT 1 FROM provider_schedule_event_join_presence p
    WHERE p.event_id=? AND p.join_identity=? AND p.left_at IS NULL
      AND p.last_seen_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 90 SECOND)
      AND (?=0 OR EXISTS (SELECT 1 FROM provider_schedule_event_video_admissions a
        WHERE a.event_id=p.event_id AND a.join_identity=p.join_identity)) LIMIT 1`,
  [event.id, identity, waitingRoomEnabled ? 1 : 0]);
  if (!rows.length) throw fail(403, 'Join the interview and wait for admission before using chat.');
}
