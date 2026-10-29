import pool from '../config/database.js';
import ProviderScheduleEvent from '../models/ProviderScheduleEvent.model.js';
import { assertCalendarHost, calendarMeeting } from './meetingCalendarGuest.service.js';
import { roomUnavailable, canJoinTeamMeeting, hasActiveMeetingMembership } from './meetingJoinPolicy.service.js';
import { tenantMeetingBase } from '../utils/tenantMeetingUrl.js';
import { joinUrlForTeamMeeting } from '../utils/joinToken.js';
import { activeTrainingStaff } from './scheduledTraining.service.js';

const fail = (status, message) => Object.assign(new Error(message), { status });

export function teamMeetingGuestLinkStatus(event) {
  const waitingRoomEnabled = ![0, false, '0', 'false'].includes(event.waiting_room_enabled);
  return { guestLinkEnabled: !!event.guest_link_shared_at, waitingRoomEnabled, roomOpen: !waitingRoomEnabled };
}

export async function shareTeamMeetingGuestLink(ref, userId) {
  const event = await ProviderScheduleEvent.resolveByJoinRef(ref);
  if (!event || !['TEAM_MEETING', 'HUDDLE'].includes(String(event.kind).toUpperCase())) throw fail(404, 'Meeting not found.');
  await assertCalendarHost('team-meeting', event, userId);
  const unavailable = roomUnavailable(event);
  if (unavailable) throw fail(unavailable.status, unavailable.error.message);
  // Interview participant URLs identify the applicant; never repurpose them as a public invitation.
  if (String(event.meeting_subtype || '').toLowerCase() === 'interview') throw fail(400, 'Use the interview invitation for applicant access.');
  const token = event.participant_join_token || event.join_token;
  if (!/^[\w-]{32}$/.test(String(token || ''))) throw fail(409, 'The guest link is not ready. Reopen the meeting and try again.');
  await pool.execute('UPDATE provider_schedule_events SET guest_link_shared_at=COALESCE(guest_link_shared_at,UTC_TIMESTAMP()) WHERE id=?', [event.id]);
  return {
    joinUrl: joinUrlForTeamMeeting(await tenantMeetingBase(event.agency_id), token),
    ...teamMeetingGuestLinkStatus({ ...event, guest_link_shared_at: true })
  };
}

/** A shared invitation identifies an active signed-in member without admitting them. */
export async function enterSharedTeamMeetingLink(ref, actor) {
  const userId = Number(actor?.id);
  const event = await calendarMeeting('team-meeting', ref);
  if (String(event.meeting_subtype || '').toLowerCase() === 'interview') throw fail(400, 'Use your interview invitation.');
  if (await canJoinTeamMeeting(event, userId)) return { identified: true };
  const role = String(actor?.role || '').toLowerCase();
  const staff = role && !['client','client_guardian','guardian','parent','family_member','school_staff','school_support','school_admin','school','kiosk','prehire','candidate'].includes(role);
  const training = String(event.meeting_subtype || '').toLowerCase() === 'training';
  const activeStaff = staff && await hasActiveMeetingMembership(event.agency_id, userId)
    && (!training || (await activeTrainingStaff(event.agency_id)).some(person => Number(person.id) === userId));
  if (!event.guest_link_shared_at || !activeStaff) {
    return { identified: false, guestReason: 'This account is not eligible for tracked attendance in this meeting. You can join as an untracked guest, or log in with an invited agency account.' };
  }
  // The opaque URL is the invitation. Never grant host rights or a main-room admission.
  await pool.execute('INSERT IGNORE INTO provider_schedule_event_attendees (event_id,user_id) VALUES (?,?)', [event.id, userId]);
  return { identified: true };
}
