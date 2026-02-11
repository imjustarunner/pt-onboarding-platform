import OfficeLocation from '../models/OfficeLocation.model.js';
import OfficeLocationAgency from '../models/OfficeLocationAgency.model.js';
import OfficeStandingAssignment from '../models/OfficeStandingAssignment.model.js';
import OfficeBookingPlan from '../models/OfficeBookingPlan.model.js';
import OfficeEvent from '../models/OfficeEvent.model.js';
import OfficeRoom from '../models/OfficeRoom.model.js';
import OfficeRoomAssignment from '../models/OfficeRoomAssignment.model.js';
import ProviderVirtualSlotAvailability from '../models/ProviderVirtualSlotAvailability.model.js';
import User from '../models/User.model.js';
import GoogleCalendarService from '../services/googleCalendar.service.js';
import pool from '../config/database.js';

const canManageSchedule = (role) =>
  role === 'clinical_practice_assistant' || role === 'admin' || role === 'super_admin' || role === 'support' || role === 'staff';

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function weekdayHourFromSqlDateTime(value) {
  const raw = String(value || '').trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const hour = Number(m[4]);
  if (![y, mo, d, hour].every((n) => Number.isInteger(n))) return null;
  const weekdayIndex = new Date(Date.UTC(y, mo, d)).getUTCDay();
  return {
    weekdayName: WEEKDAY_NAMES[weekdayIndex] || '',
    weekdayIndex,
    hour
  };
}

function weekdayHourInTz(dateLike, timeZone) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'long',
      hour: '2-digit',
      hour12: false
    }).formatToParts(d);
    const weekday = parts.find((p) => p.type === 'weekday')?.value || '';
    const hourStr = parts.find((p) => p.type === 'hour')?.value || '';
    const hour = parseInt(hourStr, 10);
    const normalizedHour = hour === 24 ? 0 : hour;
    const idx = WEEKDAY_NAMES.indexOf(weekday);
    if (idx < 0 || !Number.isInteger(normalizedHour)) return null;
    return { weekdayName: weekday, weekdayIndex: idx, hour: normalizedHour };
  } catch {
    return null;
  }
}

function mysqlDateTimeForDateHour(dateStr, hour24) {
  const m = String(dateStr || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const base = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const totalHours = Number(hour24 || 0);
  const dayOffset = Math.floor(totalHours / 24);
  const normalizedHour = ((totalHours % 24) + 24) % 24;
  base.setUTCDate(base.getUTCDate() + dayOffset);
  const ymd = base.toISOString().slice(0, 10);
  return `${ymd} ${String(normalizedHour).padStart(2, '0')}:00:00`;
}

async function requireOfficeAccess(req, officeLocationId) {
  if (req.user.role === 'super_admin') return true;
  const agencies = await User.getAgencies(req.user.id);
  return await OfficeLocationAgency.userHasAccess({ officeLocationId, agencyIds: agencies.map((a) => a.id) });
}

async function resolveAgencyForProviderOffice({ providerId, officeLocationId }) {
  const providerAgencies = await User.getAgencies(providerId);
  const officeAgencies = await OfficeLocationAgency.listAgenciesForOffice(officeLocationId);
  const providerAgencyIds = new Set((providerAgencies || []).map((a) => Number(a.id)).filter((n) => Number.isInteger(n) && n > 0));
  const officeAgencyIds = (officeAgencies || []).map((a) => Number(a.id)).filter((n) => Number.isInteger(n) && n > 0);
  const match = officeAgencyIds.find((id) => providerAgencyIds.has(id));
  return match || officeAgencyIds[0] || null;
}

function addDaysYmd(ymd, days) {
  const m = String(ymd || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

function normalizeRecurringUntilDate(bookingStartDate, rawUntil) {
  const start = String(bookingStartDate || '').slice(0, 10);
  const maxAllowed = addDaysYmd(start, 364);
  const candidate = String(rawUntil || '').slice(0, 10);
  if (!candidate || !/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return maxAllowed;
  if (candidate <= start) return maxAllowed;
  return candidate > maxAllowed ? maxAllowed : candidate;
}

function weekdayIndexFromYmd(ymd) {
  const m = String(ymd || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
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

    const recurringUntilDate = normalizeRecurringUntilDate(bookingStartDate, req.body?.recurringUntilDate);
    const plan = await OfficeBookingPlan.upsertActive({
      standingAssignmentId: sid,
      bookedFrequency: freq,
      bookingStartDate,
      activeUntilDate: recurringUntilDate,
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

    const scope = String(req.body?.scope || 'future').trim().toLowerCase();
    if (scope !== 'future') {
      return res.status(400).json({ error: { message: 'Assignment-level forfeit only supports scope=future' } });
    }

    await OfficeBookingPlan.deactivateByAssignmentId(sid);
    await OfficeStandingAssignment.update(sid, { is_active: false });
    res.json({ ok: true, scope: 'future' });
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

    const isOwner = Number(req.user?.id || 0) === Number(bookedProviderId);
    if (!isOwner && !canManageSchedule(req.user.role)) {
      return res.status(403).json({ error: { message: 'Only assigned provider or schedule managers can update booking status' } });
    }

    const shouldBook = req.body?.booked !== false && String(req.body?.booked || '').toLowerCase() !== 'false';
    const updated = shouldBook
      ? await OfficeEvent.markBooked({ eventId: eid, bookedProviderId })
      : await OfficeEvent.markAvailable({ eventId: eid });
    // Best-effort: mirror to Google Calendar (provider + room resource).
    try {
      await GoogleCalendarService.upsertBookedOfficeEvent({ officeEventId: updated?.id || eid });
    } catch {
      // ignore
    }
    res.json({ ok: true, booked: shouldBook, event: updated });
  } catch (e) {
    next(e);
  }
};

export const setEventVirtualIntakeAvailability = async (req, res, next) => {
  try {
    const { officeId, eventId } = req.params;
    const officeLocationId = parseInt(officeId, 10);
    const eid = parseInt(eventId, 10);
    if (!officeLocationId || !eid) return res.status(400).json({ error: { message: 'Invalid ids' } });

    const ok = await requireOfficeAccess(req, officeLocationId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const ev = await OfficeEvent.findById(eid);
    if (!ev || Number(ev.office_location_id) !== Number(officeLocationId)) {
      return res.status(404).json({ error: { message: 'Event not found' } });
    }
    const providerId = Number(ev.assigned_provider_id || ev.booked_provider_id || 0) || null;
    if (!providerId) return res.status(400).json({ error: { message: 'Event is missing assigned provider' } });

    const isOwner = Number(req.user?.id || 0) === providerId;
    if (!isOwner && !canManageSchedule(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const enabled = req.body?.enabled !== false && String(req.body?.enabled || '').toLowerCase() !== 'false';
    const startAt = String(ev.start_at || '').replace('T', ' ').slice(0, 19);
    const endAt = String(ev.end_at || '').replace('T', ' ').slice(0, 19);
    if (!startAt || !endAt) return res.status(400).json({ error: { message: 'Event is missing start/end time' } });

    const agencyId = await resolveAgencyForProviderOffice({ providerId, officeLocationId });
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'Unable to resolve agency for provider/office' } });
    }

    if (enabled) {
      await ProviderVirtualSlotAvailability.upsertSlot({
        agencyId,
        providerId,
        officeLocationId,
        roomId: Number(ev.room_id || 0) || null,
        startAt,
        endAt,
        sessionType: 'INTAKE',
        source: 'OFFICE_EVENT',
        sourceEventId: ev.id,
        createdByUserId: req.user.id
      });
    } else {
      await ProviderVirtualSlotAvailability.deactivateSlot({
        agencyId,
        providerId,
        startAt,
        endAt
      });
    }

    res.json({ ok: true, enabled, agencyId, providerId, startAt, endAt });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(409).json({ error: { message: 'Virtual slot overrides are not available yet. Run database migrations.' } });
    }
    next(e);
  }
};

export const setEventBookingPlan = async (req, res, next) => {
  try {
    const { officeId, eventId } = req.params;
    const officeLocationId = parseInt(officeId, 10);
    const eid = parseInt(eventId, 10);
    if (!officeLocationId || !eid) return res.status(400).json({ error: { message: 'Invalid ids' } });

    const ok = await requireOfficeAccess(req, officeLocationId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const ev = await OfficeEvent.findById(eid);
    if (!ev || Number(ev.office_location_id) !== Number(officeLocationId)) {
      return res.status(404).json({ error: { message: 'Event not found' } });
    }

    const freq = String(req.body?.bookedFrequency || '').toUpperCase();
    if (!['WEEKLY', 'BIWEEKLY', 'MONTHLY'].includes(freq)) {
      return res.status(400).json({ error: { message: 'bookedFrequency must be WEEKLY, BIWEEKLY, or MONTHLY' } });
    }
    const bookingStartDate = String(req.body?.bookingStartDate || String(ev.start_at || '').slice(0, 10)).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingStartDate)) {
      return res.status(400).json({ error: { message: 'bookingStartDate must be YYYY-MM-DD' } });
    }

    const providerId = Number(ev.assigned_provider_id || ev.booked_provider_id || 0) || null;
    if (!providerId) return res.status(400).json({ error: { message: 'Event is missing assigned provider' } });
    const isOwner = Number(req.user?.id || 0) === providerId;
    if (!isOwner && !canManageSchedule(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const loc = await OfficeLocation.findById(officeLocationId);
    const tz = String(loc?.timezone || 'America/New_York');
    const wh = weekdayHourFromSqlDateTime(ev.start_at) || weekdayHourInTz(ev.start_at, tz);
    if (!wh) return res.status(400).json({ error: { message: 'Invalid event start time' } });

    let assignment = await OfficeStandingAssignment.findActiveBySlot({
      officeLocationId,
      roomId: Number(ev.room_id),
      weekday: wh.weekdayIndex,
      hour: wh.hour
    });

    const assignedFrequency = freq === 'BIWEEKLY' ? 'BIWEEKLY' : 'WEEKLY';
    if (assignment?.id && Number(assignment.provider_id) !== providerId) {
      return res.status(409).json({ error: { message: 'That slot is already assigned to another provider.' } });
    }
    if (!assignment?.id) {
      assignment = await OfficeStandingAssignment.create({
        officeLocationId,
        roomId: Number(ev.room_id),
        providerId,
        weekday: wh.weekdayIndex,
        hour: wh.hour,
        assignedFrequency,
        createdByUserId: req.user.id
      });
    }

    const recurringUntilDate = normalizeRecurringUntilDate(bookingStartDate, req.body?.recurringUntilDate);
    const plan = await OfficeBookingPlan.upsertActive({
      standingAssignmentId: assignment.id,
      bookedFrequency: freq,
      bookingStartDate,
      activeUntilDate: recurringUntilDate,
      createdByUserId: req.user.id
    });

    res.json({ ok: true, standingAssignment: assignment, bookingPlan: plan });
  } catch (e) {
    next(e);
  }
};

export const cancelEvent = async (req, res, next) => {
  try {
    const { officeId, eventId } = req.params;
    const officeLocationId = parseInt(officeId, 10);
    const eid = parseInt(eventId, 10);
    if (!officeLocationId || !eid) return res.status(400).json({ error: { message: 'Invalid ids' } });

    const ok = await requireOfficeAccess(req, officeLocationId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const ev = await OfficeEvent.findById(eid);
    if (!ev || Number(ev.office_location_id) !== Number(officeLocationId)) {
      return res.status(404).json({ error: { message: 'Event not found' } });
    }

    if (!canManageSchedule(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only schedule managers can cancel/delete schedule events' } });
    }

    const scope = String(req.body?.scope || 'occurrence').trim().toLowerCase();
    if (!['occurrence', 'future'].includes(scope)) {
      return res.status(400).json({ error: { message: 'scope must be occurrence or future' } });
    }

    const startAt = String(ev.start_at || '').replace('T', ' ').slice(0, 19);
    if (!startAt) return res.status(400).json({ error: { message: 'Event has invalid start time' } });

    if (scope === 'occurrence') {
      const updated = await OfficeEvent.cancelOccurrence({ eventId: eid });
      await ProviderVirtualSlotAvailability.deactivateBySourceEventId(eid);
      return res.json({ ok: true, scope: 'occurrence', event: updated });
    }

    const standingAssignmentId = Number(ev.standing_assignment_id || 0) || null;
    const recurrenceGroupId = ev.recurrence_group_id || null;
    if (!standingAssignmentId && !recurrenceGroupId) {
      const updated = await OfficeEvent.cancelOccurrence({ eventId: eid });
      await ProviderVirtualSlotAvailability.deactivateBySourceEventId(eid);
      return res.json({ ok: true, scope: 'occurrence', event: updated, downgradedFromFuture: true });
    }

    let eventIds = [];
    if (standingAssignmentId) {
      const [rows] = await pool.execute(
        `SELECT id
         FROM office_events
         WHERE standing_assignment_id = ?
           AND start_at >= ?`,
        [standingAssignmentId, startAt]
      );
      eventIds = (rows || []).map((r) => Number(r.id)).filter((n) => Number.isInteger(n) && n > 0);
      await OfficeBookingPlan.deactivateByAssignmentId(standingAssignmentId);
      await OfficeStandingAssignment.update(standingAssignmentId, { is_active: false });
      await OfficeEvent.cancelFutureByStandingAssignment({ standingAssignmentId, startAt });
    } else {
      const [rows] = await pool.execute(
        `SELECT id
         FROM office_events
         WHERE recurrence_group_id = ?
           AND start_at >= ?`,
        [recurrenceGroupId, startAt]
      );
      eventIds = (rows || []).map((r) => Number(r.id)).filter((n) => Number.isInteger(n) && n > 0);
      await OfficeEvent.cancelFutureByRecurrenceGroup({ recurrenceGroupId, startAt });
    }

    for (const id of eventIds) {
      // eslint-disable-next-line no-await-in-loop
      await ProviderVirtualSlotAvailability.deactivateBySourceEventId(id);
    }

    res.json({
      ok: true,
      scope: 'future',
      cancelledEventCount: eventIds.length,
      standingAssignmentId: standingAssignmentId || null
    });
  } catch (e) {
    next(e);
  }
};

export const forfeitEvent = async (req, res, next) => {
  try {
    const { officeId, eventId } = req.params;
    const officeLocationId = parseInt(officeId, 10);
    const eid = parseInt(eventId, 10);
    if (!officeLocationId || !eid) return res.status(400).json({ error: { message: 'Invalid ids' } });

    const ok = await requireOfficeAccess(req, officeLocationId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const ev = await OfficeEvent.findById(eid);
    if (!ev || Number(ev.office_location_id) !== Number(officeLocationId)) {
      return res.status(404).json({ error: { message: 'Event not found' } });
    }

    const acknowledged = req.body?.acknowledged === true || req.body?.acknowledged === 'true';
    if (!acknowledged) {
      return res.status(400).json({ error: { message: 'acknowledged is required to forfeit' } });
    }

    const providerId = Number(ev.assigned_provider_id || ev.booked_provider_id || 0) || null;
    const isOwner = Number(req.user?.id || 0) === providerId;
    if (!isOwner && !canManageSchedule(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const scope = String(req.body?.scope || 'occurrence').trim().toLowerCase();
    if (!['occurrence', 'future'].includes(scope)) {
      return res.status(400).json({ error: { message: 'scope must be occurrence or future' } });
    }

    const startAt = String(ev.start_at || '').replace('T', ' ').slice(0, 19);
    if (!startAt) return res.status(400).json({ error: { message: 'Event has invalid start time' } });

    if (scope === 'occurrence') {
      const updated = await OfficeEvent.cancelOccurrence({ eventId: eid });
      await ProviderVirtualSlotAvailability.deactivateBySourceEventId(eid);
      return res.json({ ok: true, scope: 'occurrence', event: updated });
    }

    const standingAssignmentId = Number(ev.standing_assignment_id || 0) || null;
    const recurrenceGroupId = ev.recurrence_group_id || null;
    if (!standingAssignmentId && !recurrenceGroupId) {
      const updated = await OfficeEvent.cancelOccurrence({ eventId: eid });
      await ProviderVirtualSlotAvailability.deactivateBySourceEventId(eid);
      return res.json({ ok: true, scope: 'occurrence', event: updated, downgradedFromFuture: true });
    }

    let eventIds = [];
    if (standingAssignmentId) {
      const [rows] = await pool.execute(
        `SELECT id
         FROM office_events
         WHERE standing_assignment_id = ?
           AND start_at >= ?`,
        [standingAssignmentId, startAt]
      );
      eventIds = (rows || []).map((r) => Number(r.id)).filter((n) => Number.isInteger(n) && n > 0);
      await OfficeBookingPlan.deactivateByAssignmentId(standingAssignmentId);
      await OfficeStandingAssignment.update(standingAssignmentId, { is_active: false });
      await OfficeEvent.cancelFutureByStandingAssignment({ standingAssignmentId, startAt });
    } else {
      const [rows] = await pool.execute(
        `SELECT id
         FROM office_events
         WHERE recurrence_group_id = ?
           AND start_at >= ?`,
        [recurrenceGroupId, startAt]
      );
      eventIds = (rows || []).map((r) => Number(r.id)).filter((n) => Number.isInteger(n) && n > 0);
      await OfficeEvent.cancelFutureByRecurrenceGroup({ recurrenceGroupId, startAt });
    }

    for (const id of eventIds) {
      // eslint-disable-next-line no-await-in-loop
      await ProviderVirtualSlotAvailability.deactivateBySourceEventId(id);
    }

    return res.json({
      ok: true,
      scope: 'future',
      forfeitedEventCount: eventIds.length,
      standingAssignmentId: standingAssignmentId || null
    });
  } catch (e) {
    next(e);
  }
};

export const staffAssignOpenSlot = async (req, res, next) => {
  try {
    const { officeId } = req.params;
    const officeLocationId = parseInt(officeId, 10);
    if (!officeLocationId) return res.status(400).json({ error: { message: 'Invalid officeId' } });

    if (!canManageSchedule(req.user.role)) {
      return res.status(403).json({ error: { message: 'Only staff/admin can assign office slots' } });
    }

    const ok = await requireOfficeAccess(req, officeLocationId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const roomId = parseInt(req.body?.roomId, 10);
    const assignedUserId = parseInt(req.body?.assignedUserId, 10);
    const date = String(req.body?.date || '').slice(0, 10);
    const hour = parseInt(req.body?.hour, 10);
    const endHourRaw = req.body?.endHour;
    const endHour = endHourRaw === undefined || endHourRaw === null || endHourRaw === ''
      ? null
      : parseInt(endHourRaw, 10);
    const recurrenceFrequencyRaw = String(req.body?.recurrenceFrequency || 'ONCE').trim().toUpperCase();
    const recurrenceFrequency = ['ONCE', 'WEEKLY', 'BIWEEKLY'].includes(recurrenceFrequencyRaw) ? recurrenceFrequencyRaw : 'ONCE';
    const recurringUntilDate = normalizeRecurringUntilDate(date, req.body?.recurringUntilDate);
    if (!roomId || !assignedUserId) {
      return res.status(400).json({ error: { message: 'roomId and assignedUserId are required' } });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: { message: 'date must be YYYY-MM-DD' } });
    }
    if (!(Number.isFinite(hour) && hour >= 0 && hour <= 23)) {
      return res.status(400).json({ error: { message: 'hour must be 0..23' } });
    }
    if (endHour !== null) {
      if (!(Number.isFinite(endHour) && endHour >= 1 && endHour <= 24)) {
        return res.status(400).json({ error: { message: 'endHour must be 1..24' } });
      }
      if (!(endHour > hour)) {
        return res.status(400).json({ error: { message: 'endHour must be after hour' } });
      }
    }

    const room = await OfficeRoom.findById(roomId);
    if (!room || room.location_id !== officeLocationId) {
      return res.status(404).json({ error: { message: 'Room not found for this office' } });
    }

    const user = await User.findById(assignedUserId);
    if (!user) return res.status(404).json({ error: { message: 'Assigned user not found' } });

    const startAt = mysqlDateTimeForDateHour(date, hour);
    const endAt = mysqlDateTimeForDateHour(date, (endHour !== null ? endHour : (hour + 1)));

    if (recurrenceFrequency !== 'ONCE' && endHour !== null && endHour !== hour + 1) {
      return res.status(400).json({ error: { message: 'Recurring assignment currently supports one-hour slots only' } });
    }

    // Avoid double-booking a room. Block if ANY assignment/event overlaps the requested window.
    try {
      const [aRows] = await pool.execute(
        `SELECT id
         FROM office_room_assignments
         WHERE room_id = ?
           AND start_at < ?
           AND (end_at IS NULL OR end_at > ?)
         LIMIT 1`,
        [roomId, endAt, startAt]
      );
      if ((aRows || []).length) {
        return res.status(409).json({ error: { message: 'That office is already assigned during this time.' } });
      }
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }
    try {
      const [eRows] = await pool.execute(
        `SELECT id
         FROM office_events
         WHERE room_id = ?
           AND start_at < ?
           AND end_at > ?
         LIMIT 1`,
        [roomId, endAt, startAt]
      );
      if ((eRows || []).length) {
        return res.status(409).json({ error: { message: 'That office has an existing schedule event during this time.' } });
      }
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    if (recurrenceFrequency !== 'ONCE') {
      const weekday = weekdayIndexFromYmd(date);
      if (!Number.isInteger(weekday)) {
        return res.status(400).json({ error: { message: 'Invalid date for recurring assignment' } });
      }

      const existingStanding = await OfficeStandingAssignment.findActiveBySlot({
        officeLocationId,
        roomId,
        weekday,
        hour
      });
      if (existingStanding?.id) {
        return res.status(409).json({ error: { message: 'That recurring office slot is already assigned.' } });
      }

      const assignedFrequency = recurrenceFrequency === 'BIWEEKLY' ? 'BIWEEKLY' : 'WEEKLY';
      const standingAssignment = await OfficeStandingAssignment.create({
        officeLocationId,
        roomId,
        providerId: assignedUserId,
        weekday,
        hour,
        assignedFrequency,
        createdByUserId: req.user.id
      });

      await OfficeStandingAssignment.update(standingAssignment.id, {
        available_since_date: date,
        last_two_week_confirmed_at: new Date()
      });

      const event = await OfficeEvent.upsertSlotState({
        officeLocationId,
        roomId,
        startAt,
        endAt,
        slotState: 'ASSIGNED_AVAILABLE',
        standingAssignmentId: standingAssignment.id,
        bookingPlanId: null,
        assignedProviderId: assignedUserId,
        bookedProviderId: null,
        createdByUserId: req.user.id
      });

      return res.json({
        ok: true,
        recurrenceFrequency,
        recurringUntilDate,
        standingAssignment,
        events: event?.id ? [event] : []
      });
    }

    const assignment = await OfficeRoomAssignment.create({
      roomId,
      assignedUserId,
      assignmentType: 'ONE_TIME',
      startAt,
      endAt,
      sourceRequestId: null,
      createdByUserId: req.user.id
    });

    // Create one hourly office_event per assigned hour so each occurrence can be booked individually.
    // Keep assignment row for legacy paths that still read office_room_assignments.
    const createdEvents = [];
    try {
      const startHour = Number(hour);
      const finalHour = Number(endHour !== null ? endHour : hour + 1);
      for (let h = startHour; h < finalHour; h++) {
        const slotStartAt = mysqlDateTimeForDateHour(date, h);
        const slotEndAt = mysqlDateTimeForDateHour(date, h + 1);
        // eslint-disable-next-line no-await-in-loop
        const event = await OfficeEvent.upsertSlotState({
          officeLocationId,
          roomId,
          startAt: slotStartAt,
          endAt: slotEndAt,
          slotState: 'ASSIGNED_AVAILABLE',
          standingAssignmentId: null,
          bookingPlanId: null,
          assignedProviderId: assignedUserId,
          bookedProviderId: null,
          createdByUserId: req.user.id
        });
        if (event?.id) createdEvents.push(event);
      }
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }

    res.json({ ok: true, assignment, events: createdEvents });
  } catch (e) {
    next(e);
  }
};
