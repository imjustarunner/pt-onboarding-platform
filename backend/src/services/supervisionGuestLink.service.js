import { assertCalendarHost, calendarMeeting } from './meetingCalendarGuest.service.js';
import { tenantMeetingBase } from '../utils/tenantMeetingUrl.js';
import { joinUrlForSupervision } from '../utils/joinToken.js';

export async function supervisionGuestLink(ref, userId) {
  const session = await calendarMeeting('supervision', ref, { host: true });
  await assertCalendarHost('supervision', session, userId);
  const token = session.participant_join_token || session.join_token;
  if (!/^[\w-]{32}$/.test(String(token || ''))) {
    throw Object.assign(new Error('The guest link is not ready. Reopen the session and try again.'), { status: 409 });
  }
  return { joinUrl: `${joinUrlForSupervision(await tenantMeetingBase(session.agency_id), token)}?guest=1` };
}
