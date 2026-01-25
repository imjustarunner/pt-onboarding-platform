import OfficeLocation from '../models/OfficeLocation.model.js';
import OfficeLocationAgency from '../models/OfficeLocationAgency.model.js';
import OfficeStandingAssignment from '../models/OfficeStandingAssignment.model.js';
import OfficeBookingPlan from '../models/OfficeBookingPlan.model.js';
import OfficeEvent from '../models/OfficeEvent.model.js';
import User from '../models/User.model.js';
import GoogleCalendarService from '../services/googleCalendar.service.js';

const canManageSchedule = (role) =>
  role === 'clinical_practice_assistant' || role === 'admin' || role === 'super_admin' || role === 'support' || role === 'staff';

async function requireOfficeAccess(req, officeLocationId) {
  if (req.user.role === 'super_admin') return true;
  const agencies = await User.getAgencies(req.user.id);
  return await OfficeLocationAgency.userHasAccess({ officeLocationId, agencyIds: agencies.map((a) => a.id) });
}

export const setBookingPlan = async (req, res, next) => {
  try {
    const { officeId, assignmentId } = req.params;
    const officeLocationId = parseInt(officeId, 10);
    const sid = parseInt(assignmentId, 10);
    if (!officeLocationId || !sid) return res.status(400).json({ error: { message: 'Invalid ids' } });

    const ok = await requireOfficeAccess(req, officeLocationId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const assignment = await OfficeStandingAssignment.findById(sid);
    if (!assignment || assignment.office_location_id !== officeLocationId) {
      return res.status(404).json({ error: { message: 'Standing assignment not found' } });
    }

    const freq = String(req.body?.bookedFrequency || '').toUpperCase();
    if (!['WEEKLY', 'BIWEEKLY', 'MONTHLY'].includes(freq)) {
      return res.status(400).json({ error: { message: 'bookedFrequency must be WEEKLY, BIWEEKLY, or MONTHLY' } });
    }
    const bookingStartDate = String(req.body?.bookingStartDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingStartDate)) {
      return res.status(400).json({ error: { message: 'bookingStartDate must be YYYY-MM-DD' } });
    }

    // Only provider who owns it (or schedule managers) can set booking plans
    const isOwner = req.user.id === assignment.provider_id;
    if (!isOwner && !canManageSchedule(req.user.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const plan = await OfficeBookingPlan.upsertActive({
      standingAssignmentId: sid,
      bookedFrequency: freq,
      bookingStartDate,
      createdByUserId: req.user.id
    });

    // When booking, availability is still considered assigned_available unless temporarily set;
    // the materializer will mark occurrences as booked.
    await OfficeStandingAssignment.update(sid, { last_two_week_confirmed_at: new Date() });

    res.json({ ok: true, bookingPlan: plan });
  } catch (e) {
    next(e);
  }
};

export const keepAvailable = async (req, res, next) => {
  try {
    const { officeId, assignmentId } = req.params;
    const officeLocationId = parseInt(officeId, 10);
    const sid = parseInt(assignmentId, 10);
    if (!officeLocationId || !sid) return res.status(400).json({ error: { message: 'Invalid ids' } });

    const ok = await requireOfficeAccess(req, officeLocationId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const assignment = await OfficeStandingAssignment.findById(sid);
    if (!assignment || assignment.office_location_id !== officeLocationId) {
      return res.status(404).json({ error: { message: 'Standing assignment not found' } });
    }

    if (req.user.id !== assignment.provider_id) {
      return res.status(403).json({ error: { message: 'Only the assigned provider can confirm availability' } });
    }

    const acknowledged = req.body?.acknowledged === true || req.body?.acknowledged === 'true';
    if (!acknowledged) {
      return res.status(400).json({ error: { message: 'acknowledged is required to keep slot available' } });
    }

    // Keeping available clears any temporary mode and keeps booking plan inactive unless user books later.
    await OfficeStandingAssignment.update(sid, {
      availability_mode: 'AVAILABLE',
      temporary_until_date: null,
      available_since_date: assignment.available_since_date || new Date().toISOString().slice(0, 10),
      last_two_week_confirmed_at: new Date()
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const setTemporary = async (req, res, next) => {
  try {
    const { officeId, assignmentId } = req.params;
    const officeLocationId = parseInt(officeId, 10);
    const sid = parseInt(assignmentId, 10);
    if (!officeLocationId || !sid) return res.status(400).json({ error: { message: 'Invalid ids' } });

    const ok = await requireOfficeAccess(req, officeLocationId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const assignment = await OfficeStandingAssignment.findById(sid);
    if (!assignment || assignment.office_location_id !== officeLocationId) {
      return res.status(404).json({ error: { message: 'Standing assignment not found' } });
    }
    if (req.user.id !== assignment.provider_id) {
      return res.status(403).json({ error: { message: 'Only the assigned provider can set temporary mode' } });
    }

    const weeks = parseInt(req.body?.weeks || 4, 10);
    const w = Number.isFinite(weeks) && weeks > 0 ? weeks : 4;
    const until = new Date();
    until.setDate(until.getDate() + w * 7);
    const untilDate = until.toISOString().slice(0, 10);

    await OfficeStandingAssignment.update(sid, {
      availability_mode: 'TEMPORARY',
      temporary_until_date: untilDate,
      last_two_week_confirmed_at: new Date()
    });
    res.json({ ok: true, temporaryUntilDate: untilDate });
  } catch (e) {
    next(e);
  }
};

export const forfeitAssignment = async (req, res, next) => {
  try {
    const { officeId, assignmentId } = req.params;
    const officeLocationId = parseInt(officeId, 10);
    const sid = parseInt(assignmentId, 10);
    if (!officeLocationId || !sid) return res.status(400).json({ error: { message: 'Invalid ids' } });

    const ok = await requireOfficeAccess(req, officeLocationId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const assignment = await OfficeStandingAssignment.findById(sid);
    if (!assignment || assignment.office_location_id !== officeLocationId) {
      return res.status(404).json({ error: { message: 'Standing assignment not found' } });
    }

    const isOwner = req.user.id === assignment.provider_id;
    if (!isOwner && !canManageSchedule(req.user.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const acknowledged = req.body?.acknowledged === true || req.body?.acknowledged === 'true';
    if (!acknowledged) {
      return res.status(400).json({ error: { message: 'acknowledged is required to forfeit' } });
    }

    await OfficeBookingPlan.deactivateByAssignmentId(sid);
    await OfficeStandingAssignment.update(sid, { is_active: false });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const staffBookEvent = async (req, res, next) => {
  try {
    const { officeId, eventId } = req.params;
    const officeLocationId = parseInt(officeId, 10);
    const eid = parseInt(eventId, 10);
    if (!officeLocationId || !eid) return res.status(400).json({ error: { message: 'Invalid ids' } });

    if (!canManageSchedule(req.user.role)) {
      return res.status(403).json({ error: { message: 'Only staff/admin can book slots' } });
    }

    const ok = await requireOfficeAccess(req, officeLocationId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const ev = await OfficeEvent.findById(eid);
    if (!ev || ev.office_location_id !== officeLocationId) {
      return res.status(404).json({ error: { message: 'Event not found' } });
    }

    const bookedProviderId = ev.assigned_provider_id || ev.booked_provider_id;
    if (!bookedProviderId) {
      return res.status(400).json({ error: { message: 'Event is missing assigned provider' } });
    }

    const updated = await OfficeEvent.markBooked({ eventId: eid, bookedProviderId });
    // Best-effort: mirror to Google Calendar (provider + room resource).
    try {
      await GoogleCalendarService.upsertBookedOfficeEvent({ officeEventId: updated?.id || eid });
    } catch {
      // ignore
    }
    res.json({ ok: true, event: updated });
  } catch (e) {
    next(e);
  }
};

