import pool from '../config/database.js';
import { invitationEvents } from './meetingInvitations.service.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';

// A personal invitation is a capability for one recipient's invited series.
// It never creates an app session or accepts a caller-supplied user identity.
export async function invitationResponseContext(token, eventId, now = new Date()) {
  if (!/^[\w-]{32}$/.test(String(token || '')) || !Number.isSafeInteger(Number(eventId)) || Number(eventId) < 1) {
    throw Object.assign(new Error('Open the complete personal invitation link from your message.'), { status: 404 });
  }
  const [[invitation]] = await pool.execute('SELECT * FROM meeting_email_invitations WHERE join_token=?', [token]);
  if (!invitation || !['supervision','team_meeting'].includes(invitation.meeting_type)) {
    throw Object.assign(new Error('This personal invitation was not found.'), { status: 404 });
  }
  const event = (await invitationEvents(invitation, { includeDeclined: true })).find(e => Number(e.id) === Number(eventId));
  const ongoingSupervision = invitation.meeting_type === 'supervision' && event?.status === 'IN_PROGRESS';
  if (!event || event.meeting_completed_at || event.live_ended_at || (!(parseUtcDate(event.end_at || event.end_date) > now) && !ongoingSupervision)) {
    throw Object.assign(new Error('This meeting has ended, was canceled, or you are no longer invited.'), { status: 410 });
  }
  return { invitation, event, userId: Number(invitation.user_id) };
}
