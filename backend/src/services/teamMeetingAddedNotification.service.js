import { createNotificationAndDispatch } from './notificationDispatcher.service.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';

export async function notifyAddedTeamMeetingAttendee({ event, userId, actorUserId, actorName, now = new Date() }) {
  const title = String(event.title || '').trim() || 'Team meeting';
  const start = parseUtcDate(event.start_at), end = parseUtcDate(event.end_at);
  const live = !!(start && end && start <= now && end > now);
  return createNotificationAndDispatch({
    type: 'team_meeting_scheduled',
    severity: 'info',
    title: `Added to "${title}"`,
    message: `${actorName || 'A teammate'} added you to "${title}". ${live ? 'The meeting is happening now. Tap to join.' : 'Open your schedule to view the meeting and join when it starts.'}`,
    userId,
    agencyId: Number(event.agency_id),
    relatedEntityType: 'provider_schedule_event',
    relatedEntityId: Number(event.id),
    actorUserId,
    actorSource: 'Schedule',
    audienceJson: { eventId: Number(event.id), live, refreshSchedule: true }
  });
}
