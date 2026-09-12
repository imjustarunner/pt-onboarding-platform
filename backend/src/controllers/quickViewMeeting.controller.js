import ProviderScheduleEvent from '../models/ProviderScheduleEvent.model.js';
import SupervisionSession from '../models/SupervisionSession.model.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import { quickMeetingLink } from '../utils/quickViewCalendar.js';
import { buildPublicPortalBaseUrl } from '../utils/publicPortalUrl.js';

// Resolve an invitation only after the PIN session's participation has been checked.
export async function getQuickMeetingLink(req, res, next) {
  try {
    const source = req.params.type === 'supervision' ? 'supervision' : 'schedule';
    if (!['supervision', 'team-meeting'].includes(req.params.type)) return res.status(400).json({ error: { message: 'Invalid meeting type' } });
    const model = source === 'supervision' ? SupervisionSession : ProviderScheduleEvent;
    const ref = String(req.params.ref || '');
    const event = /^\d+$/.test(ref) ? await model.findById(ref) : await model.findByJoinToken(ref);
    const userId = req.quickView.userId;
    const agencies = await User.getAgencies(userId);
    if (!event || (event.agency_id && !agencies.some((a) => Number(a.id) === Number(event.agency_id)))) return res.status(404).json({ error: { message: 'Meeting unavailable' } });
    const events = await model.listForUserInWindow({ allAgencies: true, userId, providerId: userId, windowStart: event.start_at, windowEnd: event.end_at });
    if (!events.some((e) => Number(e.id) === Number(event.id))) return res.status(403).json({ error: { message: 'You are not a participant in this meeting' } });
    const agency = await Agency.findById(event.agency_id || req.quickView.agencyId);
    const joinUrl = quickMeetingLink(event, { source, viewerId: userId, portalBase: buildPublicPortalBaseUrl(agency) });
    if (!joinUrl) return res.status(409).json({ error: { message: 'This meeting has no active video link. Check the schedule for its location.' } });
    res.json({ joinUrl });
  } catch (e) { next(e); }
}
