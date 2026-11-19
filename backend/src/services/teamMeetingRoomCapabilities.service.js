import { assertCalendarHost } from './meetingCalendarGuest.service.js';
import { assertDialInMeeting, dialInConfigured } from './meetingDialInPolicy.js';

/** Availability hints for optional room controls. Their action endpoints retain
 * their own current authorization; a video-host label grants no extra access. */
export async function teamMeetingRoomCapabilities({ meeting, userId, isGuest = false }, {
  calendarHost = assertCalendarHost, dialInMeeting = assertDialInMeeting,
  configured = dialInConfigured
} = {}) {
  const capabilities = { dialIn:false, calendarGuests:false };
  if (isGuest || !Number(userId) || !['TEAM_MEETING','HUDDLE'].includes(meeting?.kind)
    || meeting.live_ended_at || meeting.meeting_completed_at) return capabilities;
  try {
    if (configured()) { dialInMeeting('team-meeting', meeting); capabilities.dialIn=true; }
  } catch (error) {
    if (!error.status) console.warn('[team-meeting] dial-in availability unconfirmed', {eventId:meeting.id});
  }
  // A slow optional authorization source must not hold the video credential
  // response indefinitely. Late results cannot alter the returned capabilities.
  let timer;
  const allowed=Promise.resolve().then(() => calendarHost('team-meeting', meeting, Number(userId))).then(() => true, error => {
    if (!error.status || error.status >= 500) console.warn('[team-meeting] calendar guest availability unconfirmed', {eventId:meeting.id});
    return false;
  });
  capabilities.calendarGuests=await Promise.race([allowed,new Promise(resolve => {
    timer=setTimeout(() => resolve(false),2000); timer.unref?.();
  })]).finally(() => clearTimeout(timer));
  return capabilities;
}
