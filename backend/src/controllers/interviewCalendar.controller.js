import ProviderScheduleEvent from '../models/ProviderScheduleEvent.model.js';
import HiringInterview from '../models/HiringInterview.model.js';
import { interviewCalendar } from '../utils/interviewCalendar.js';
export async function downloadInterviewCalendar(req, res, next) {
  try {
    const ref = String(req.params.eventId || '');
    if (!ref || /^\d+$/.test(ref)) return res.sendStatus(404);
    const event = await ProviderScheduleEvent.resolveByJoinRef(ref);
    if (!event || ![event.participant_join_token, event.join_token].filter(Boolean).includes(ref)) return res.sendStatus(404);
    const interview = await HiringInterview.findByScheduleEventId(event.id);
    if (!interview) return res.sendStatus(404);
    const calendar = interviewCalendar({ startsAt: event.start_at, endsAt: event.end_at, timezone: event.event_timezone || interview.interview_timezone,
      title: interview.display_title || event.title, publicJoinUrl: interview.public_join_url, interviewId: interview.id });
    if (!calendar) return res.sendStatus(404);
    res.set({ 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="interview.ics"', 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' });
    res.send(calendar.ics);
  } catch (error) { next(error); }
}
