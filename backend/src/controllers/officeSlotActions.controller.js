import OfficeLocation from '../models/OfficeLocation.model.js';
import OfficeLocationAgency from '../models/OfficeLocationAgency.model.js';
import OfficeStandingAssignment from '../models/OfficeStandingAssignment.model.js';
import OfficeBookingPlan from '../models/OfficeBookingPlan.model.js';
import OfficeEvent from '../models/OfficeEvent.model.js';
import OfficeRoom from '../models/OfficeRoom.model.js';
import OfficeRoomAssignment from '../models/OfficeRoomAssignment.model.js';
import OfficeBookingRequest from '../models/OfficeBookingRequest.model.js';
import ProviderVirtualSlotAvailability from '../models/ProviderVirtualSlotAvailability.model.js';
import ProviderInPersonSlotAvailability from '../models/ProviderInPersonSlotAvailability.model.js';
import User from '../models/User.model.js';
import AdminAuditLog from '../models/AdminAuditLog.model.js';
import GoogleCalendarService from '../services/googleCalendar.service.js';
import { validateSchedulingSelection } from '../services/schedulingTaxonomy.service.js';
import { ensureAppointmentContext } from '../services/appointmentContext.service.js';
import pool from '../config/database.js';

const canManageSchedule = (role) =>
  role === 'clinical_practice_assistant' || role === 'provider_plus' || role === 'admin' || role === 'super_admin' || role === 'superadmin' || role === 'support' || role === 'staff';
const requiresSupervisorDeleteApproval = (role) => {
  const r = String(role || '').toLowerCase();
  return r === 'clinical_practice_assistant' || r === 'provider_plus' || r === 'staff';
};

async function resolveAuditAgencyIdForOffice(officeLocationId, actorUserId) {
  const officeAgencies = await OfficeLocationAgency.listAgenciesForOffice(officeLocationId);
  const officeAgencyId = Number(officeAgencies?.[0]?.id || 0) || null;
  if (officeAgencyId) return officeAgencyId;
  const actorAgencies = await User.getAgencies(actorUserId);
  return Number(actorAgencies?.[0]?.id || 0) || null;
}

async function logDeleteAuditAction({
  officeLocationId,
  actorUserId,
  targetUserId,
  actionType,
  metadata
}) {
  try {
    const auditAgencyId = await resolveAuditAgencyIdForOffice(officeLocationId, actorUserId);
    if (!auditAgencyId) return;
    await AdminAuditLog.logAction({
      actionType,
      actorUserId: Number(actorUserId || 0) || null,
      targetUserId: Number(targetUserId || 0) || null,
      agencyId: auditAgencyId,
      metadata
    });
  } catch {
    // best-effort audit logging
  }
}

function eventLooksBooked(ev = {}) {
  const status = String(ev?.status || '').trim().toUpperCase();
  const slotState = String(ev?.slot_state || '').trim().toUpperCase();
  return status === 'BOOKED' || slotState === 'ASSIGNED_BOOKED';
}

function bookingSelectionFromBody(body = {}) {
  return {
    appointmentTypeCode: body?.appointmentTypeCode || body?.appointment_type_code || null,
    appointmentSubtypeCode: body?.appointmentSubtypeCode || body?.appointment_subtype_code || null,
    serviceCode: body?.serviceCode || body?.service_code || null,
    modality: body?.modality || null
  };
}

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

function mysqlDateTimeFromValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 19).replace('T', ' ');
  }
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(raw)) return raw.slice(0, 19);
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 19).replace('T', ' ');
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 19).replace('T', ' ');
}

async function requireOfficeAccess(req, officeLocationId) {
  if (req.user.role === 'super_admin') return true;
  const agencies = await User.getAgencies(req.user.id);
  return await OfficeLocationAgency.userHasAccess({ officeLocationId, agencyIds: agencies.map((a) => a.id) });
}

async function resolveAgencyForProviderOffice({ providerId, officeLocationId, preferredAgencyId = null }) {
  const providerAgencies = await User.getAgencies(providerId);
  const officeAgencies = await OfficeLocationAgency.listAgenciesForOffice(officeLocationId);
  const providerAgencyIds = new Set((providerAgencies || []).map((a) => Number(a.id)).filter((n) => Number.isInteger(n) && n > 0));
  const officeAgencyIds = (officeAgencies || []).map((a) => Number(a.id)).filter((n) => Number.isInteger(n) && n > 0);
  const preferred = Number(preferredAgencyId || 0);
  if (preferred && providerAgencyIds.has(preferred) && officeAgencyIds.includes(preferred)) return preferred;
  const match = officeAgencyIds.find((id) => providerAgencyIds.has(id));
  return match || officeAgencyIds[0] || null;
}

async function cancelGoogleForOfficeEventIds(eventIds = []) {
  for (const id of eventIds) {
    const eid = Number(id || 0);
    if (!eid) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      await GoogleCalendarService.cancelBookedOfficeEvent({ officeEventId: eid });
    } catch {
      // best-effort cleanup only
    }
  }
}

async function promoteTemporaryAssignmentIfBooked(standingAssignmentId) {
  const sid = Number(standingAssignmentId || 0);
  if (!sid) return;
  const assignment = await OfficeStandingAssignment.findById(sid);
  if (!assignment) return;
  if (String(assignment.availability_mode || '').toUpperCase() !== 'TEMPORARY') return;
  await OfficeStandingAssignment.update(sid, {
    availability_mode: 'AVAILABLE',
    temporary_until_date: null,
    last_two_week_confirmed_at: new Date()
  });
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

function normalizeBookedOccurrenceCount(rawCount) {
  if (rawCount === null || rawCount === undefined || rawCount === '') return 6;
  const n = parseInt(rawCount, 10);
  if (!Number.isInteger(n) || n < 1) return 6;
  return Math.min(n, 104);
}

function weekdayIndexFromYmd(ymd) {
  const m = String(ymd || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
}

function ymdFromDateLike(value, fallback = null) {
  const raw = String(value || '').trim();
  const exact = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (exact) return `${exact[1]}-${exact[2]}-${exact[3]}`;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return fallback;
}

function startOfWeekYmd(ymd) {
  const m = String(ymd || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

function uniqueWeekdays(rawWeekdays, fallbackDate) {
  const fallback = weekdayIndexFromYmd(fallbackDate);
  const parsed = Array.isArray(rawWeekdays)
    ? rawWeekdays.map((w) => parseInt(w, 10)).filter((w) => Number.isInteger(w) && w >= 0 && w <= 6)
    : [];
  const set = new Set(parsed);
  if (!set.size && Number.isInteger(fallback)) set.add(fallback);
  return Array.from(set.values()).sort((a, b) => a - b);
}

function generateRecurrenceGroupId(prefix = 'OFFICE_SET') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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
    const bookedOccurrenceCount = normalizeBookedOccurrenceCount(req.body?.bookedOccurrenceCount);
    const plan = await OfficeBookingPlan.upsertActive({
      standingAssignmentId: sid,
      bookedFrequency: freq,
      bookingStartDate,
      activeUntilDate: recurringUntilDate,
      bookedOccurrenceCount,
      createdByUserId: req.user.id
    });

    // When booking, availability is still considered assigned_available unless temporarily set;
    // the materializer will mark occurrences as booked.
    await OfficeStandingAssignment.update(sid, { last_two_week_confirmed_at: new Date() });

    // Also mark the selected occurrence booked immediately so UI reflects assigned_booked now.
    // If no concrete event exists yet for that date/hour, booking-plan still remains active.
    try {
      const [rows] = await pool.execute(
        `SELECT id
         FROM office_events
         WHERE standing_assignment_id = ?
           AND DATE(start_at) = ?
           AND (status IS NULL OR UPPER(status) <> 'CANCELLED')
         ORDER BY start_at ASC
         LIMIT 1`,
        [sid, bookingStartDate]
      );
      const eventId = Number(rows?.[0]?.id || 0) || 0;
      if (eventId > 0) {
        await OfficeEvent.markBooked({
          eventId,
          bookedProviderId: assignment.provider_id,
          appointmentTypeCode: bookingSelectionFromBody(req.body).appointmentTypeCode,
          appointmentSubtypeCode: bookingSelectionFromBody(req.body).appointmentSubtypeCode,
          serviceCode: bookingSelectionFromBody(req.body).serviceCode,
          modality: bookingSelectionFromBody(req.body).modality
        });
      }
    } catch {
      // Best-effort immediate occurrence mark; plan save remains source of truth.
    }

    res.json({ ok: true, bookingPlan: plan });
  } catch (e) {
    next(e);
  }
};

export const setAssignmentRecurrence = async (req, res, next) => {
  try {
    const { officeId, assignmentId } = req.params;
    const officeLocationId = parseInt(officeId, 10);
    const sid = parseInt(assignmentId, 10);
    if (!officeLocationId || !sid) return res.status(400).json({ error: { message: 'Invalid ids' } });

    const ok = await requireOfficeAccess(req, officeLocationId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    if (!canManageSchedule(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only schedule managers can edit recurrence' } });
    }

    const assignment = await OfficeStandingAssignment.findById(sid);
    if (!assignment || Number(assignment.office_location_id) !== Number(officeLocationId)) {
      return res.status(404).json({ error: { message: 'Standing assignment not found' } });
    }

    const recurrenceFrequency = String(req.body?.recurrenceFrequency || '').toUpperCase();
    if (!['WEEKLY', 'BIWEEKLY'].includes(recurrenceFrequency)) {
      return res.status(400).json({ error: { message: 'recurrenceFrequency must be WEEKLY or BIWEEKLY' } });
    }

    const updated = await OfficeStandingAssignment.update(sid, {
      assigned_frequency: recurrenceFrequency,
      is_active: true,
      last_two_week_confirmed_at: new Date()
    });

    return res.json({ ok: true, recurrenceFrequency, standingAssignment: updated });
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
    if (!canManageSchedule(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only schedule managers can set temporary mode' } });
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

/** Extend a TEMPORARY assignment by 6 weeks. Max 2 extensions; after that provider must re-request. */
export const extendTemporary = async (req, res, next) => {
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
      return res.status(403).json({ error: { message: 'Only the assigned provider can extend' } });
    }

    if (String(assignment.availability_mode || '').toUpperCase() !== 'TEMPORARY') {
      return res.status(400).json({ error: { message: 'Only temporary assignments can be extended' } });
    }

    const extCount = Number(assignment.temporary_extension_count || 0);
    if (extCount >= 2) {
      return res.status(400).json({ error: { message: 'Extension limit reached. Please submit a new office request.' } });
    }

    const untilBase = assignment.temporary_until_date
      ? new Date(String(assignment.temporary_until_date))
      : new Date();
    const until = new Date(untilBase);
    until.setDate(until.getDate() + 6 * 7);
    const untilDate = until.toISOString().slice(0, 10);

    await OfficeStandingAssignment.update(sid, {
      temporary_until_date: untilDate,
      temporary_extension_count: extCount + 1,
      last_two_week_confirmed_at: new Date()
    });
    res.json({ ok: true, temporaryUntilDate: untilDate, extensionCount: extCount + 1 });
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

    const assignment = await OfficeStandingAssignment.findById(sid);
    if (!assignment || assignment.office_location_id !== officeLocationId) {
      return res.status(404).json({ error: { message: 'Standing assignment not found' } });
    }

    const isOwner = req.user.id === assignment.provider_id;
    const hasOfficeAccess = isOwner ? true : await requireOfficeAccess(req, officeLocationId);
    if (!hasOfficeAccess) return res.status(403).json({ error: { message: 'Access denied' } });
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
    let validatedSelection = {
      appointmentTypeCode: null,
      appointmentSubtypeCode: null,
      serviceCode: null,
      modality: null
    };
    if (shouldBook) {
      const provider = await User.findById(bookedProviderId);
      if (!provider) {
        return res.status(404).json({ error: { message: 'Booked provider not found' } });
      }
      const rawSelection = bookingSelectionFromBody(req.body);
      const policyAgencyId = await resolveAgencyForProviderOffice({
        providerId: bookedProviderId,
        officeLocationId,
        preferredAgencyId: Number(req.body?.agencyId || req.query?.agencyId || 0) || null
      });
      validatedSelection = await validateSchedulingSelection({
        agencyId: policyAgencyId,
        userRole: provider.role,
        providerCredentialText: provider.credential,
        appointmentTypeCode: rawSelection.appointmentTypeCode || ev.appointment_type_code || null,
        appointmentSubtypeCode: rawSelection.appointmentSubtypeCode || ev.appointment_subtype_code || null,
        serviceCode: rawSelection.serviceCode || ev.service_code || null,
        modality: rawSelection.modality || ev.modality || null,
        scheduledStartAt: ev.start_at || null,
        scheduledEndAt: ev.end_at || null
      });
    }
    const updated = shouldBook
      ? await OfficeEvent.markBooked({
        eventId: eid,
        bookedProviderId,
        appointmentTypeCode: validatedSelection.appointmentTypeCode,
        appointmentSubtypeCode: validatedSelection.appointmentSubtypeCode,
        serviceCode: validatedSelection.serviceCode,
        modality: validatedSelection.modality
      })
      : await OfficeEvent.markAvailable({ eventId: eid });
    if (shouldBook) {
      const clientId = Number(req.body?.clientId || ev.client_id || 0) || null;
      if (clientId) {
        try {
          await ensureAppointmentContext({
            officeEventId: updated?.id || eid,
            clientId,
            sourceTimezone: String(req.body?.sourceTimezone || 'America/New_York'),
            actorUserId: req.user.id
          });
        } catch {
          // best-effort context ensure on booking status toggle
        }
      }
    }
    if (shouldBook) {
      await promoteTemporaryAssignmentIfBooked(ev.standing_assignment_id);
    }
    const targetEventId = updated?.id || eid;
    // Best-effort: mirror to Google Calendar (provider + room resource).
    try {
      if (shouldBook) {
        await GoogleCalendarService.upsertBookedOfficeEvent({ officeEventId: targetEventId });
      } else {
        await GoogleCalendarService.cancelBookedOfficeEvent({ officeEventId: targetEventId });
      }
    } catch {
      // ignore sync cleanup failures
    }
    res.json({ ok: true, booked: shouldBook, event: updated });
  } catch (e) {
    next(e);
  }
};

export const setEventOutcome = async (req, res, next) => {
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

    const eventProviderId = Number(ev.booked_provider_id || ev.assigned_provider_id || 0) || null;
    const isOwner = eventProviderId && Number(req.user?.id || 0) === eventProviderId;
    if (!isOwner && !canManageSchedule(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only assigned provider or schedule managers can set session outcomes' } });
    }

    const rawOutcome = req.body?.outcome ?? req.body?.statusOutcome ?? null;
    const rawReason = req.body?.cancellationReason ?? req.body?.reason ?? null;
    const updated = await OfficeEvent.setOutcome({
      eventId: eid,
      outcome: rawOutcome,
      cancellationReason: rawReason
    });

    return res.json({
      ok: true,
      event: updated
    });
  } catch (e) {
    if (Number(e?.status || 0) === 400) {
      return res.status(400).json({ error: { message: e.message || 'Invalid outcome payload' } });
    }
    next(e);
  }
};

export const getEventContext = async (req, res, next) => {
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

    const eventProviderId = Number(ev.booked_provider_id || ev.assigned_provider_id || 0) || null;
    const isOwner = eventProviderId && Number(req.user?.id || 0) === eventProviderId;
    if (!isOwner && !canManageSchedule(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only assigned provider or schedule managers can view event context' } });
    }

    const ensured = await ensureAppointmentContext({
      officeEventId: eid,
      clientId: Number(ev.client_id || 0) || null,
      sourceTimezone: String(req.query?.sourceTimezone || 'America/New_York'),
      actorUserId: req.user.id
    });

    return res.json({
      ok: true,
      ensured
    });
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
    const startAt = mysqlDateTimeFromValue(ev.start_at);
    const endAt = mysqlDateTimeFromValue(ev.end_at);
    if (!startAt || !endAt) return res.status(400).json({ error: { message: 'Event is missing start/end time' } });

    const requestAgencyId = Number(req.body?.agencyId || req.query?.agencyId || 0) || null;
    const agencyId = await resolveAgencyForProviderOffice({
      providerId,
      officeLocationId,
      preferredAgencyId: requestAgencyId || req.user?.agencyId || null
    });
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
      const wasIntakeActive = await ProviderVirtualSlotAvailability.isActiveIntakeSlot({
        agencyId,
        providerId,
        startAt,
        endAt
      });
      if (!wasIntakeActive) {
        return res.status(409).json({ error: { message: 'Virtual intake is not enabled for this slot.' } });
      }
      // Turning off intake keeps the slot virtually available (regular-only).
      await ProviderVirtualSlotAvailability.upsertSlot({
        agencyId,
        providerId,
        officeLocationId,
        roomId: Number(ev.room_id || 0) || null,
        startAt,
        endAt,
        sessionType: 'REGULAR',
        source: 'OFFICE_EVENT',
        sourceEventId: ev.id,
        createdByUserId: req.user.id
      });
    }

    const finalBookedState = String(ev.slot_state || '').toUpperCase() === 'ASSIGNED_BOOKED' || String(ev.status || '').toUpperCase() === 'BOOKED';
    res.json({ ok: true, enabled, agencyId, providerId, startAt, endAt, booked: finalBookedState });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(409).json({ error: { message: 'Virtual slot overrides are not available yet. Run database migrations.' } });
    }
    next(e);
  }
};

export const setEventInPersonIntakeAvailability = async (req, res, next) => {
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
    const startAt = mysqlDateTimeFromValue(ev.start_at);
    const endAt = mysqlDateTimeFromValue(ev.end_at);
    if (!startAt || !endAt) return res.status(400).json({ error: { message: 'Event is missing start/end time' } });

    const requestAgencyId = Number(req.body?.agencyId || req.query?.agencyId || 0) || null;
    const agencyId = await resolveAgencyForProviderOffice({
      providerId,
      officeLocationId,
      preferredAgencyId: requestAgencyId || req.user?.agencyId || null
    });
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'Unable to resolve agency for provider/office' } });
    }

    if (enabled) {
      await ProviderInPersonSlotAvailability.upsertSlot({
        agencyId,
        providerId,
        officeLocationId,
        roomId: Number(ev.room_id || 0) || null,
        startAt,
        endAt,
        source: 'OFFICE_EVENT',
        sourceEventId: ev.id,
        createdByUserId: req.user.id
      });
    } else {
      const wasActive = await ProviderInPersonSlotAvailability.isActiveSlot({
        agencyId,
        providerId,
        startAt,
        endAt
      });
      if (!wasActive) {
        return res.status(409).json({ error: { message: 'In-person intake is not enabled for this slot.' } });
      }
      await ProviderInPersonSlotAvailability.deactivateSlot({
        agencyId,
        providerId,
        startAt,
        endAt
      });
    }

    res.json({ ok: true, enabled, agencyId, providerId, startAt, endAt });
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return res.status(409).json({ error: { message: 'In-person intake slot overrides are not available yet. Run database migrations.' } });
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
    const bookingStartDate = ymdFromDateLike(req.body?.bookingStartDate, ymdFromDateLike(ev.start_at));
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
      const recurrenceGroupId = ev.recurrence_group_id || generateRecurrenceGroupId('OFFICE_ASSIGNMENT');
      const reusable = await OfficeStandingAssignment.findAnyBySlotProviderFrequency({
        officeLocationId,
        roomId: Number(ev.room_id),
        providerId,
        weekday: wh.weekdayIndex,
        hour: wh.hour,
        assignedFrequency
      });
      if (reusable?.id) {
        assignment = await OfficeStandingAssignment.update(reusable.id, {
          is_active: true,
          recurrence_group_id: recurrenceGroupId,
          available_since_date: bookingStartDate,
          last_two_week_confirmed_at: new Date()
        });
      } else {
        assignment = await OfficeStandingAssignment.create({
          officeLocationId,
          roomId: Number(ev.room_id),
          providerId,
          weekday: wh.weekdayIndex,
          hour: wh.hour,
          assignedFrequency,
          recurrenceGroupId,
          createdByUserId: req.user.id
        });
      }
    }

    const recurringUntilDate = normalizeRecurringUntilDate(bookingStartDate, req.body?.recurringUntilDate);
    const bookedOccurrenceCount = normalizeBookedOccurrenceCount(req.body?.bookedOccurrenceCount);
    const plan = await OfficeBookingPlan.upsertActive({
      standingAssignmentId: assignment.id,
      bookedFrequency: freq,
      bookingStartDate,
      activeUntilDate: recurringUntilDate,
      bookedOccurrenceCount,
      createdByUserId: req.user.id
    });
    const provider = await User.findById(providerId);
    if (!provider) {
      return res.status(404).json({ error: { message: 'Assigned provider not found' } });
    }
    const rawSelection = bookingSelectionFromBody(req.body);
    const policyAgencyId = await resolveAgencyForProviderOffice({
      providerId,
      officeLocationId,
      preferredAgencyId: Number(req.body?.agencyId || req.query?.agencyId || 0) || null
    });
    const validatedSelection = await validateSchedulingSelection({
      agencyId: policyAgencyId,
      userRole: provider.role,
      providerCredentialText: provider.credential,
      appointmentTypeCode: rawSelection.appointmentTypeCode || ev.appointment_type_code || null,
      appointmentSubtypeCode: rawSelection.appointmentSubtypeCode || ev.appointment_subtype_code || null,
      serviceCode: rawSelection.serviceCode || ev.service_code || null,
      modality: rawSelection.modality || ev.modality || null,
      scheduledStartAt: ev.start_at || null,
      scheduledEndAt: ev.end_at || null
    });
    const bookedEvent = await OfficeEvent.markBooked({
      eventId: eid,
      bookedProviderId: providerId,
      appointmentTypeCode: validatedSelection.appointmentTypeCode,
      appointmentSubtypeCode: validatedSelection.appointmentSubtypeCode,
      serviceCode: validatedSelection.serviceCode,
      modality: validatedSelection.modality
    });
    const clientId = Number(req.body?.clientId || ev.client_id || 0) || null;
    if (clientId) {
      try {
        await ensureAppointmentContext({
          officeEventId: bookedEvent?.id || eid,
          clientId,
          sourceTimezone: String(req.body?.sourceTimezone || 'America/New_York'),
          actorUserId: req.user.id
        });
      } catch {
        // best-effort context ensure on booking-plan promotion
      }
    }
    await promoteTemporaryAssignmentIfBooked(assignment?.id || ev.standing_assignment_id);
    try {
      await GoogleCalendarService.upsertBookedOfficeEvent({ officeEventId: bookedEvent?.id || eid });
    } catch {
      // ignore mirror failures
    }
    res.json({ ok: true, standingAssignment: assignment, bookingPlan: plan, event: bookedEvent });
  } catch (e) {
    next(e);
  }
};

export const setEventRecurrence = async (req, res, next) => {
  try {
    const { officeId, eventId } = req.params;
    const officeLocationId = parseInt(officeId, 10);
    const eid = parseInt(eventId, 10);
    if (!officeLocationId || !eid) return res.status(400).json({ error: { message: 'Invalid ids' } });

    const ok = await requireOfficeAccess(req, officeLocationId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    if (!canManageSchedule(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only schedule managers can edit recurrence' } });
    }

    const ev = await OfficeEvent.findById(eid);
    if (!ev || Number(ev.office_location_id) !== Number(officeLocationId)) {
      return res.status(404).json({ error: { message: 'Event not found' } });
    }

    const recurrenceFrequency = String(req.body?.recurrenceFrequency || '').toUpperCase();
    if (!['WEEKLY', 'BIWEEKLY'].includes(recurrenceFrequency)) {
      return res.status(400).json({ error: { message: 'recurrenceFrequency must be WEEKLY or BIWEEKLY' } });
    }

    const providerId = Number(ev.assigned_provider_id || ev.booked_provider_id || 0) || null;
    if (!providerId) return res.status(400).json({ error: { message: 'Event is missing assigned provider' } });

    const loc = await OfficeLocation.findById(officeLocationId);
    const tz = String(loc?.timezone || 'America/New_York');
    const wh = weekdayHourFromSqlDateTime(ev.start_at) || weekdayHourInTz(ev.start_at, tz);
    if (!wh) return res.status(400).json({ error: { message: 'Invalid event start time' } });

    const roomId = Number(ev.room_id || 0) || null;
    if (!roomId) return res.status(400).json({ error: { message: 'Event is missing room id' } });

    let assignment = null;
    const existingStandingId = Number(ev.standing_assignment_id || 0) || null;
    if (existingStandingId) {
      assignment = await OfficeStandingAssignment.findById(existingStandingId);
      if (!assignment) {
        return res.status(404).json({ error: { message: 'Standing assignment not found' } });
      }
      if (Number(assignment.provider_id) !== providerId) {
        return res.status(409).json({ error: { message: 'Standing assignment provider mismatch' } });
      }
      assignment = await OfficeStandingAssignment.update(assignment.id, {
        assigned_frequency: recurrenceFrequency,
        is_active: true,
        available_since_date: ymdFromDateLike(ev.start_at, new Date().toISOString().slice(0, 10)),
        last_two_week_confirmed_at: new Date()
      });
    } else {
      const slotExisting = await OfficeStandingAssignment.findActiveBySlot({
        officeLocationId,
        roomId,
        weekday: wh.weekdayIndex,
        hour: wh.hour
      });
      if (slotExisting?.id && Number(slotExisting.provider_id) !== providerId) {
        return res.status(409).json({ error: { message: 'That recurring office slot is already assigned.' } });
      }
      if (slotExisting?.id && Number(slotExisting.provider_id) === providerId) {
        assignment = await OfficeStandingAssignment.update(slotExisting.id, {
          assigned_frequency: recurrenceFrequency,
          is_active: true,
          available_since_date: ymdFromDateLike(ev.start_at, new Date().toISOString().slice(0, 10)),
          last_two_week_confirmed_at: new Date()
        });
      } else {
        const recurrenceGroupId = ev.recurrence_group_id || generateRecurrenceGroupId('OFFICE_ASSIGNMENT');
        const reusable = await OfficeStandingAssignment.findAnyBySlotProviderFrequency({
          officeLocationId,
          roomId,
          providerId,
          weekday: wh.weekdayIndex,
          hour: wh.hour,
          assignedFrequency: recurrenceFrequency
        });
        if (reusable?.id) {
          assignment = await OfficeStandingAssignment.update(reusable.id, {
            assigned_frequency: recurrenceFrequency,
            is_active: true,
            recurrence_group_id: recurrenceGroupId,
            available_since_date: ymdFromDateLike(ev.start_at, new Date().toISOString().slice(0, 10)),
            last_two_week_confirmed_at: new Date()
          });
        } else {
          assignment = await OfficeStandingAssignment.create({
            officeLocationId,
            roomId,
            providerId,
            weekday: wh.weekdayIndex,
            hour: wh.hour,
            assignedFrequency: recurrenceFrequency,
            recurrenceGroupId,
            createdByUserId: req.user.id
          });
          assignment = await OfficeStandingAssignment.update(assignment.id, {
            available_since_date: ymdFromDateLike(ev.start_at, new Date().toISOString().slice(0, 10)),
            last_two_week_confirmed_at: new Date()
          });
        }
      }
    }

    const recurrenceGroupId = assignment?.recurrence_group_id || ev.recurrence_group_id || null;
    await pool.execute(
      `UPDATE office_events
       SET standing_assignment_id = ?,
           recurrence_group_id = COALESCE(?, recurrence_group_id),
           assigned_provider_id = COALESCE(assigned_provider_id, ?),
           slot_state = CASE
             WHEN slot_state = 'ASSIGNED_BOOKED' THEN 'ASSIGNED_BOOKED'
             ELSE 'ASSIGNED_AVAILABLE'
           END,
           status = CASE
             WHEN status = 'BOOKED' THEN 'BOOKED'
             ELSE 'RELEASED'
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [assignment.id, recurrenceGroupId, providerId, eid]
    );

    // If this is currently booked, keep booking recurrence in sync with assignment recurrence.
    const isBookedNow = String(ev.slot_state || '').toUpperCase() === 'ASSIGNED_BOOKED' || String(ev.status || '').toUpperCase() === 'BOOKED';
    let bookingPlan = null;
    if (isBookedNow) {
      const bookingStartDate = ymdFromDateLike(ev.start_at, new Date().toISOString().slice(0, 10));
      const recurringUntilDate = normalizeRecurringUntilDate(bookingStartDate, req.body?.recurringUntilDate);
      const bookedOccurrenceCount = normalizeBookedOccurrenceCount(req.body?.bookedOccurrenceCount);
      bookingPlan = await OfficeBookingPlan.upsertActive({
        standingAssignmentId: assignment.id,
        bookedFrequency: recurrenceFrequency,
        bookingStartDate,
        activeUntilDate: recurringUntilDate,
        bookedOccurrenceCount,
        createdByUserId: req.user.id
      });
    }

    const updatedEvent = await OfficeEvent.findById(eid);
    return res.json({
      ok: true,
      recurrenceFrequency,
      standingAssignment: assignment,
      bookingPlan,
      event: updatedEvent
    });
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
    if (!['occurrence', 'future', 'week', 'until'].includes(scope)) {
      return res.status(400).json({ error: { message: 'scope must be occurrence, future, week, or until' } });
    }
    const applyToSet = req.body?.applyToSet === true || req.body?.applyToSet === 'true';
    const untilDateRaw = String(req.body?.untilDate || '').slice(0, 10);
    if (scope === 'until' && !/^\d{4}-\d{2}-\d{2}$/.test(untilDateRaw)) {
      return res.status(400).json({ error: { message: 'untilDate must be YYYY-MM-DD when scope=until' } });
    }

    const startAt = mysqlDateTimeFromValue(ev.start_at);
    if (!startAt) return res.status(400).json({ error: { message: 'Event has invalid start time' } });
    const startDateYmd = String(startAt).slice(0, 10);
    if (scope === 'until' && untilDateRaw < startDateYmd) {
      return res.status(400).json({ error: { message: 'untilDate must be on or after the selected date' } });
    }

    const shouldQueueDeleteApproval =
      scope === 'occurrence'
      && !applyToSet
      && eventLooksBooked(ev)
      && requiresSupervisorDeleteApproval(req.user?.role);
    if (shouldQueueDeleteApproval) {
      const approvalPayload = {
        version: 1,
        kind: 'BOOKED_EVENT_DELETE_APPROVAL',
        eventId: eid,
        scope,
        applyToSet: false,
        untilDate: null,
        requestedByUserId: Number(req.user?.id || 0) || null,
        requestedAt: new Date().toISOString()
      };
      const approvalRequest = await OfficeBookingRequest.create({
        requestType: 'DELETE_EVENT',
        officeLocationId,
        roomId: Number(ev.room_id || 0) || null,
        requestedProviderId: Number(ev.booked_provider_id || ev.assigned_provider_id || req.user?.id || 0),
        clientId: Number(ev.client_id || 0) || null,
        startAt: startAt,
        endAt: mysqlDateTimeFromValue(ev.end_at) || startAt,
        recurrence: 'ONCE',
        requesterNotes: JSON.stringify(approvalPayload),
        appointmentTypeCode: ev.appointment_type_code || null,
        appointmentSubtypeCode: ev.appointment_subtype_code || null,
        serviceCode: ev.service_code || null,
        modality: ev.modality || null
      });
      try {
        const auditAgencyId = await resolveAuditAgencyIdForOffice(officeLocationId, req.user?.id);
        if (auditAgencyId) {
          await AdminAuditLog.logAction({
            actionType: 'OFFICE_EVENT_DELETE_REQUESTED',
            actorUserId: Number(req.user?.id || 0) || null,
            targetUserId: Number(ev.booked_provider_id || ev.assigned_provider_id || 0) || null,
            agencyId: auditAgencyId,
            metadata: {
              officeLocationId,
              roomId: Number(ev.room_id || 0) || null,
              officeEventId: eid,
              requestId: Number(approvalRequest?.id || 0) || null,
              scope
            }
          });
        }
      } catch {
        // best-effort audit logging
      }
      return res.status(202).json({
        ok: true,
        requiresApproval: true,
        approvalRequest
      });
    }

    const removeLegacyAssignmentOverlap = async () => {
      const roomId = Number(ev.room_id || 0) || null;
      const assignedUserId = Number(ev.assigned_provider_id || 0) || null;
      const endAt = mysqlDateTimeFromValue(ev.end_at);
      if (!roomId || !assignedUserId || !startAt || !endAt) return 0;
      try {
        const [result] = await pool.execute(
          `DELETE FROM office_room_assignments
           WHERE room_id = ?
             AND assigned_user_id = ?
             AND start_at < ?
             AND (end_at IS NULL OR end_at > ?)`,
          [roomId, assignedUserId, endAt, startAt]
        );
        return Number(result?.affectedRows || 0);
      } catch (e) {
        if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
        return 0;
      }
    };

    if (scope === 'occurrence') {
      const updated = await OfficeEvent.cancelOccurrence({ eventId: eid });
      await ProviderVirtualSlotAvailability.deactivateBySourceEventId(eid);
      await cancelGoogleForOfficeEventIds([eid]);
      const legacyAssignmentRowsRemoved = await removeLegacyAssignmentOverlap();
      await logDeleteAuditAction({
        officeLocationId,
        actorUserId: req.user?.id,
        targetUserId: ev.booked_provider_id || ev.assigned_provider_id || null,
        actionType: 'OFFICE_EVENT_DELETE_EXECUTED',
        metadata: {
          officeEventId: eid,
          scope: 'occurrence',
          legacyAssignmentRowsRemoved
        }
      });
      return res.json({ ok: true, scope: 'occurrence', event: updated, legacyAssignmentRowsRemoved });
    }

    let standingAssignmentId = Number(ev.standing_assignment_id || 0) || null;
    let recurrenceGroupId = ev.recurrence_group_id || null;
    if (!standingAssignmentId) {
      const bookingPlanId = Number(ev.booking_plan_id || 0) || null;
      if (bookingPlanId) {
        const [rows] = await pool.execute(
          `SELECT standing_assignment_id AS id
           FROM office_booking_plans
           WHERE id = ?
             AND standing_assignment_id IS NOT NULL
           LIMIT 1`,
          [bookingPlanId]
        );
        standingAssignmentId = Number(rows?.[0]?.id || 0) || null;
      }
    }
    if (!standingAssignmentId) {
      const providerIdFallback = Number(ev.assigned_provider_id || ev.booked_provider_id || 0) || null;
      const roomIdFallback = Number(ev.room_id || 0) || null;
      const wh = weekdayHourFromSqlDateTime(startAt);
      if (providerIdFallback && roomIdFallback && wh) {
        const [rows] = await pool.execute(
          `SELECT id, recurrence_group_id
           FROM office_standing_assignments
           WHERE office_location_id = ?
             AND room_id = ?
             AND provider_id = ?
             AND weekday = ?
             AND hour = ?
           ORDER BY is_active DESC, id DESC
           LIMIT 1`,
          [officeLocationId, roomIdFallback, providerIdFallback, wh.weekdayIndex, wh.hour]
        );
        if (rows?.[0]) {
          standingAssignmentId = Number(rows[0].id || 0) || null;
          if (!recurrenceGroupId && rows[0].recurrence_group_id) recurrenceGroupId = rows[0].recurrence_group_id;
        }
      }
    }
    if (!recurrenceGroupId && standingAssignmentId) {
      const [rows] = await pool.execute(
        `SELECT recurrence_group_id
         FROM office_standing_assignments
         WHERE id = ?
         LIMIT 1`,
        [standingAssignmentId]
      );
      recurrenceGroupId = rows?.[0]?.recurrence_group_id || null;
    }

    let rangeStart = startAt;
    let rangeEndExclusive = null;
    if (scope === 'week') {
      const ws = startOfWeekYmd(startDateYmd);
      const we = ws ? addDaysYmd(ws, 7) : null;
      rangeStart = ws ? `${ws} 00:00:00` : startAt;
      rangeEndExclusive = we ? `${we} 00:00:00` : null;
    } else if (scope === 'until') {
      rangeStart = startAt;
      const untilNextDay = addDaysYmd(untilDateRaw, 1);
      rangeEndExclusive = untilNextDay ? `${untilNextDay} 00:00:00` : null;
    }

    let targetAssignmentIds = [];
    if (standingAssignmentId) {
      if (applyToSet) {
        try {
          const [rows] = await pool.execute(
            `SELECT id
             FROM office_standing_assignments
             WHERE recurrence_group_id = (
               SELECT recurrence_group_id
               FROM office_standing_assignments
               WHERE id = ?
               LIMIT 1
             )
               AND office_location_id = ?`,
            [standingAssignmentId, officeLocationId]
          );
          targetAssignmentIds = (rows || []).map((r) => Number(r.id)).filter((n) => Number.isInteger(n) && n > 0);
        } catch (e) {
          if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
          targetAssignmentIds = [standingAssignmentId];
        }
      } else {
        targetAssignmentIds = [standingAssignmentId];
      }
    }
    if (!targetAssignmentIds.length && recurrenceGroupId && applyToSet) {
      const [rows] = await pool.execute(
        `SELECT DISTINCT standing_assignment_id AS id
         FROM office_events
         WHERE recurrence_group_id = ?
           AND standing_assignment_id IS NOT NULL`,
        [recurrenceGroupId]
      );
      targetAssignmentIds = (rows || []).map((r) => Number(r.id)).filter((n) => Number.isInteger(n) && n > 0);
    }
    if (!targetAssignmentIds.length && applyToSet) {
      const bookingPlanId = Number(ev.booking_plan_id || 0) || null;
      if (bookingPlanId) {
        const [rows] = await pool.execute(
          `SELECT standing_assignment_id AS id
           FROM office_booking_plans
           WHERE id = ?
             AND standing_assignment_id IS NOT NULL
           LIMIT 1`,
          [bookingPlanId]
        );
        targetAssignmentIds = (rows || []).map((r) => Number(r.id)).filter((n) => Number.isInteger(n) && n > 0);
      }
    }
    if (!targetAssignmentIds.length && applyToSet) {
      const providerId = Number(ev.assigned_provider_id || ev.booked_provider_id || 0) || null;
      const roomId = Number(ev.room_id || 0) || null;
      const wh = weekdayHourFromSqlDateTime(startAt);
      if (providerId && roomId && wh) {
        const [rows] = await pool.execute(
          `SELECT id
           FROM office_standing_assignments
           WHERE office_location_id = ?
             AND room_id = ?
             AND provider_id = ?
             AND weekday = ?
             AND hour = ?
           ORDER BY is_active DESC, id DESC`,
          [officeLocationId, roomId, providerId, wh.weekdayIndex, wh.hour]
        );
        targetAssignmentIds = (rows || []).map((r) => Number(r.id)).filter((n) => Number.isInteger(n) && n > 0);
      }
    }

    // If no linkage exists, downgrade non-occurrence scopes to single occurrence.
    if (!targetAssignmentIds.length && !recurrenceGroupId) {
      const updated = await OfficeEvent.cancelOccurrence({ eventId: eid });
      await ProviderVirtualSlotAvailability.deactivateBySourceEventId(eid);
      await cancelGoogleForOfficeEventIds([eid]);
      const legacyAssignmentRowsRemoved = await removeLegacyAssignmentOverlap();
      return res.json({
        ok: true,
        scope: 'occurrence',
        event: updated,
        downgradedFromScopedCancel: true,
        legacyAssignmentRowsRemoved
      });
    }

    const where = [];
    const params = [];
    if (targetAssignmentIds.length) {
      where.push(`standing_assignment_id IN (${targetAssignmentIds.map(() => '?').join(',')})`);
      params.push(...targetAssignmentIds);
    } else if (recurrenceGroupId) {
      where.push(`recurrence_group_id = ?`);
      params.push(recurrenceGroupId);
    }
    if (rangeStart) {
      where.push(`start_at >= ?`);
      params.push(rangeStart);
    }
    if (rangeEndExclusive) {
      where.push(`start_at < ?`);
      params.push(rangeEndExclusive);
    }

    const [rows] = await pool.execute(
      `SELECT id
       FROM office_events
       WHERE ${where.join(' AND ')}`,
      params
    );
    const eventIds = (rows || []).map((r) => Number(r.id)).filter((n) => Number.isInteger(n) && n > 0);

    if (eventIds.length) {
      await pool.execute(
        `UPDATE office_events
         SET status = 'CANCELLED',
             updated_at = CURRENT_TIMESTAMP
         WHERE id IN (${eventIds.map(() => '?').join(',')})`,
        eventIds
      );
    }

    // Short-term pauses keep assignment active but prevent booked materialization until date.
    if ((scope === 'week' || scope === 'until') && targetAssignmentIds.length) {
      const pauseUntilDate = scope === 'week'
        ? addDaysYmd(String(rangeEndExclusive || '').slice(0, 10), -1)
        : untilDateRaw;
      for (const sid of targetAssignmentIds) {
        // eslint-disable-next-line no-await-in-loop
        await OfficeStandingAssignment.update(sid, {
          availability_mode: 'TEMPORARY',
          temporary_until_date: pauseUntilDate,
          last_two_week_confirmed_at: new Date()
        });
      }
    }

    // Only deactivate standing assignment(s) when cancelling all future.
    if (scope === 'future' && targetAssignmentIds.length) {
      for (const sid of targetAssignmentIds) {
        // eslint-disable-next-line no-await-in-loop
        await OfficeBookingPlan.deactivateByAssignmentId(sid);
        // eslint-disable-next-line no-await-in-loop
        await OfficeStandingAssignment.update(sid, { is_active: false });
      }
    }

    for (const id of eventIds) {
      // eslint-disable-next-line no-await-in-loop
      await ProviderVirtualSlotAvailability.deactivateBySourceEventId(id);
    }
    await cancelGoogleForOfficeEventIds(eventIds);
    await logDeleteAuditAction({
      officeLocationId,
      actorUserId: req.user?.id,
      targetUserId: ev.booked_provider_id || ev.assigned_provider_id || null,
      actionType: 'OFFICE_EVENT_DELETE_EXECUTED',
      metadata: {
        officeEventId: eid,
        scope,
        applyToSet,
        cancelledEventCount: eventIds.length,
        targetedStandingAssignmentIds: targetAssignmentIds
      }
    });

    res.json({
      ok: true,
      scope,
      applyToSet,
      rangeStart,
      rangeEndExclusive,
      cancelledEventCount: eventIds.length,
      standingAssignmentId: standingAssignmentId || null,
      targetedStandingAssignmentIds: targetAssignmentIds
    });
  } catch (e) {
    next(e);
  }
};

export const deleteEventFromGoogleNow = async (req, res, next) => {
  try {
    const { officeId, eventId } = req.params;
    const officeLocationId = parseInt(officeId, 10);
    const eid = parseInt(eventId, 10);
    if (!officeLocationId || !eid) return res.status(400).json({ error: { message: 'Invalid ids' } });

    const ok = await requireOfficeAccess(req, officeLocationId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    if (!canManageSchedule(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only schedule managers can delete Google-linked office events' } });
    }

    const ev = await OfficeEvent.findById(eid);
    if (!ev || Number(ev.office_location_id) !== Number(officeLocationId)) {
      return res.status(404).json({ error: { message: 'Event not found' } });
    }

    const result = await GoogleCalendarService.cancelBookedOfficeEvent({ officeEventId: eid });
    if (!result?.ok) {
      return res.status(409).json({
        error: {
          message: result?.error || 'Failed to delete event from Google Calendar'
        }
      });
    }

    return res.json({
      ok: true,
      officeEventId: eid,
      skipped: !!result?.skipped,
      reason: result?.reason || null
    });
  } catch (e) {
    next(e);
  }
};

export const superAdminPurgeFutureBookedSlot = async (req, res, next) => {
  try {
    const { officeId, eventId } = req.params;
    const officeLocationId = parseInt(officeId, 10);
    const eid = parseInt(eventId, 10);
    if (!officeLocationId || !eid) return res.status(400).json({ error: { message: 'Invalid ids' } });
    if (String(req.user?.role || '').toLowerCase() !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Superadmin only' } });
    }

    const ok = await requireOfficeAccess(req, officeLocationId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });

    const ev = await OfficeEvent.findById(eid);
    if (!ev || Number(ev.office_location_id) !== Number(officeLocationId)) {
      return res.status(404).json({ error: { message: 'Event not found' } });
    }
    const startAt = mysqlDateTimeFromValue(ev.start_at);
    const endAt = mysqlDateTimeFromValue(ev.end_at);
    if (!startAt || !endAt) return res.status(400).json({ error: { message: 'Event has invalid start/end time' } });
    const wh = weekdayHourFromSqlDateTime(startAt);
    if (!wh) return res.status(400).json({ error: { message: 'Unable to derive slot time window' } });
    const roomId = Number(ev.room_id || 0) || null;
    if (!roomId) {
      return res.status(400).json({ error: { message: 'Event is missing room linkage' } });
    }

    // Superadmin purge mode: room + slot-time for one year, independent of provider linkage.
    // This avoids recurrence/provider edge-cases and force-clears hung future rows.
    const [assignmentRows] = await pool.execute(
      `SELECT id
       FROM office_standing_assignments
       WHERE office_location_id = ?
         AND room_id = ?
         AND hour = ?`,
      [officeLocationId, roomId, wh.hour]
    );
    const targetAssignmentIdSet = new Set(
      (assignmentRows || []).map((r) => Number(r.id)).filter((n) => Number.isInteger(n) && n > 0)
    );
    const targetAssignmentIds = Array.from(targetAssignmentIdSet.values());
    if (targetAssignmentIds.length) {
      for (const sid of targetAssignmentIds) {
        // eslint-disable-next-line no-await-in-loop
        await OfficeBookingPlan.deactivateByAssignmentId(sid);
        // eslint-disable-next-line no-await-in-loop
        await OfficeStandingAssignment.update(sid, { is_active: false });
      }
    }

    const [rows] = await pool.execute(
      `SELECT id
       FROM office_events
       WHERE office_location_id = ?
         AND room_id = ?
         AND start_at >= ?
         AND start_at < DATE_ADD(?, INTERVAL 365 DAY)
         AND TIME(start_at) = TIME(?)
         AND TIME(end_at) = TIME(?)
         AND (status IS NULL OR UPPER(status) <> 'CANCELLED')`,
      [officeLocationId, roomId, startAt, startAt, startAt, endAt]
    );
    const eventIds = (rows || []).map((r) => Number(r.id)).filter((n) => Number.isInteger(n) && n > 0);
    if (eventIds.length) {
      await pool.execute(
        `UPDATE office_events
         SET status = 'CANCELLED',
             slot_state = 'ASSIGNED_AVAILABLE',
             booked_provider_id = NULL,
             booking_plan_id = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id IN (${eventIds.map(() => '?').join(',')})`,
        eventIds
      );
    }
    for (const id of eventIds) {
      // eslint-disable-next-line no-await-in-loop
      await ProviderVirtualSlotAvailability.deactivateBySourceEventId(id);
    }
    try {
      if (eventIds.length) {
        await pool.execute(
          `UPDATE provider_in_person_slot_availability
           SET is_active = FALSE,
               updated_at = CURRENT_TIMESTAMP
           WHERE source_event_id IN (${eventIds.map(() => '?').join(',')})`,
          eventIds
        );
      }
    } catch (e) {
      if (e?.code !== 'ER_NO_SUCH_TABLE') throw e;
    }
    await cancelGoogleForOfficeEventIds(eventIds);

    return res.json({
      ok: true,
      purgedEventCount: eventIds.length,
      purgedEventIds: eventIds,
      roomId,
      startAt,
      endAt,
      hour: wh.hour,
      targetedStandingAssignmentIds: targetAssignmentIds
    });
  } catch (e) {
    next(e);
  }
};

export const cancelAssignment = async (req, res, next) => {
  try {
    const { officeId, assignmentId } = req.params;
    const officeLocationId = parseInt(officeId, 10);
    const sid = parseInt(assignmentId, 10);
    if (!officeLocationId || !sid) return res.status(400).json({ error: { message: 'Invalid ids' } });

    const ok = await requireOfficeAccess(req, officeLocationId);
    if (!ok) return res.status(403).json({ error: { message: 'Access denied' } });
    if (!canManageSchedule(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only schedule managers can cancel/delete schedule events' } });
    }

    const assignment = await OfficeStandingAssignment.findById(sid);
    if (!assignment || Number(assignment.office_location_id) !== Number(officeLocationId)) {
      return res.status(404).json({ error: { message: 'Standing assignment not found' } });
    }

    const scope = String(req.body?.scope || 'occurrence').trim().toLowerCase();
    if (!['occurrence', 'future', 'week', 'until'].includes(scope)) {
      return res.status(400).json({ error: { message: 'scope must be occurrence, future, week, or until' } });
    }
    const applyToSet = req.body?.applyToSet === true || req.body?.applyToSet === 'true';
    const slotDate = String(req.body?.date || '').slice(0, 10);
    const slotHour = parseInt(req.body?.hour, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(slotDate) || !Number.isInteger(slotHour) || slotHour < 0 || slotHour > 23) {
      return res.status(400).json({ error: { message: 'date (YYYY-MM-DD) and hour (0..23) are required' } });
    }
    const startAt = mysqlDateTimeForDateHour(slotDate, slotHour);
    const untilDateRaw = String(req.body?.untilDate || '').slice(0, 10);
    if (scope === 'until' && !/^\d{4}-\d{2}-\d{2}$/.test(untilDateRaw)) {
      return res.status(400).json({ error: { message: 'untilDate must be YYYY-MM-DD when scope=until' } });
    }
    if (scope === 'until' && untilDateRaw < slotDate) {
      return res.status(400).json({ error: { message: 'untilDate must be on or after the selected date' } });
    }

    let targetAssignmentIds = [sid];
    if (applyToSet && assignment.recurrence_group_id) {
      const [rows] = await pool.execute(
        `SELECT id
         FROM office_standing_assignments
         WHERE recurrence_group_id = ?
           AND office_location_id = ?`,
        [assignment.recurrence_group_id, officeLocationId]
      );
      const ids = (rows || []).map((r) => Number(r.id)).filter((n) => Number.isInteger(n) && n > 0);
      if (ids.length) targetAssignmentIds = ids;
    }

    let rangeStart = startAt;
    let rangeEndExclusive = null;
    if (scope === 'occurrence') {
      rangeStart = startAt;
      rangeEndExclusive = mysqlDateTimeForDateHour(slotDate, slotHour + 1);
    } else if (scope === 'week') {
      const ws = startOfWeekYmd(slotDate);
      const we = ws ? addDaysYmd(ws, 7) : null;
      rangeStart = ws ? `${ws} 00:00:00` : startAt;
      rangeEndExclusive = we ? `${we} 00:00:00` : null;
    } else if (scope === 'until') {
      rangeStart = startAt;
      const untilNextDay = addDaysYmd(untilDateRaw, 1);
      rangeEndExclusive = untilNextDay ? `${untilNextDay} 00:00:00` : null;
    }

    const where = [
      `standing_assignment_id IN (${targetAssignmentIds.map(() => '?').join(',')})`
    ];
    const params = [...targetAssignmentIds];
    if (rangeStart) {
      where.push('start_at >= ?');
      params.push(rangeStart);
    }
    if (rangeEndExclusive) {
      where.push('start_at < ?');
      params.push(rangeEndExclusive);
    }

    const [rows] = await pool.execute(
      `SELECT id
       FROM office_events
       WHERE ${where.join(' AND ')}`,
      params
    );
    const eventIds = (rows || []).map((r) => Number(r.id)).filter((n) => Number.isInteger(n) && n > 0);

    if (eventIds.length) {
      await pool.execute(
        `UPDATE office_events
         SET status = 'CANCELLED',
             updated_at = CURRENT_TIMESTAMP
         WHERE id IN (${eventIds.map(() => '?').join(',')})`,
        eventIds
      );
    }
    await cancelGoogleForOfficeEventIds(eventIds);

    if ((scope === 'week' || scope === 'until') && targetAssignmentIds.length) {
      const pauseUntilDate = scope === 'week'
        ? addDaysYmd(String(rangeEndExclusive || '').slice(0, 10), -1)
        : untilDateRaw;
      for (const id of targetAssignmentIds) {
        // eslint-disable-next-line no-await-in-loop
        await OfficeStandingAssignment.update(id, {
          availability_mode: 'TEMPORARY',
          temporary_until_date: pauseUntilDate,
          last_two_week_confirmed_at: new Date()
        });
      }
    }

    if (scope === 'future') {
      for (const id of targetAssignmentIds) {
        // eslint-disable-next-line no-await-in-loop
        await OfficeBookingPlan.deactivateByAssignmentId(id);
        // eslint-disable-next-line no-await-in-loop
        await OfficeStandingAssignment.update(id, { is_active: false });
      }
    }

    for (const id of eventIds) {
      // eslint-disable-next-line no-await-in-loop
      await ProviderVirtualSlotAvailability.deactivateBySourceEventId(id);
    }

    return res.json({
      ok: true,
      scope,
      applyToSet,
      cancelledEventCount: eventIds.length,
      targetedStandingAssignmentIds: targetAssignmentIds
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

    const ev = await OfficeEvent.findById(eid);
    if (!ev || Number(ev.office_location_id) !== Number(officeLocationId)) {
      return res.status(404).json({ error: { message: 'Event not found' } });
    }

    const acknowledged = req.body?.acknowledged === true || req.body?.acknowledged === 'true';
    if (!acknowledged) {
      return res.status(400).json({ error: { message: 'acknowledged is required to forfeit' } });
    }

    let providerId = Number(ev.assigned_provider_id || ev.booked_provider_id || 0) || null;
    if (!providerId) {
      const standingAssignmentId = Number(ev.standing_assignment_id || 0) || null;
      if (standingAssignmentId) {
        const standingAssignment = await OfficeStandingAssignment.findById(standingAssignmentId);
        providerId = Number(standingAssignment?.provider_id || 0) || null;
      }
    }
    const isOwner = Number(req.user?.id || 0) === providerId;
    const hasOfficeAccess = isOwner ? true : await requireOfficeAccess(req, officeLocationId);
    if (!hasOfficeAccess) return res.status(403).json({ error: { message: 'Access denied' } });
    if (!isOwner && !canManageSchedule(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const scope = String(req.body?.scope || 'occurrence').trim().toLowerCase();
    if (!['occurrence', 'future'].includes(scope)) {
      return res.status(400).json({ error: { message: 'scope must be occurrence or future' } });
    }

    const startAt = mysqlDateTimeFromValue(ev.start_at);
    if (!startAt) return res.status(400).json({ error: { message: 'Event has invalid start time' } });

    if (scope === 'occurrence') {
      const updated = await OfficeEvent.cancelOccurrence({ eventId: eid });
      await ProviderVirtualSlotAvailability.deactivateBySourceEventId(eid);
      await cancelGoogleForOfficeEventIds([eid]);
      return res.json({ ok: true, scope: 'occurrence', event: updated });
    }

    let standingAssignmentId = Number(ev.standing_assignment_id || 0) || null;
    let recurrenceGroupId = ev.recurrence_group_id || null;
    if (!standingAssignmentId) {
      const bookingPlanId = Number(ev.booking_plan_id || 0) || null;
      if (bookingPlanId) {
        const [rows] = await pool.execute(
          `SELECT standing_assignment_id AS id
           FROM office_booking_plans
           WHERE id = ?
             AND standing_assignment_id IS NOT NULL
           LIMIT 1`,
          [bookingPlanId]
        );
        standingAssignmentId = Number(rows?.[0]?.id || 0) || null;
      }
    }
    if (!standingAssignmentId) {
      const providerIdFallback = Number(ev.assigned_provider_id || ev.booked_provider_id || 0) || null;
      const roomIdFallback = Number(ev.room_id || 0) || null;
      const wh = weekdayHourFromSqlDateTime(startAt);
      if (providerIdFallback && roomIdFallback && wh) {
        const [rows] = await pool.execute(
          `SELECT id, recurrence_group_id
           FROM office_standing_assignments
           WHERE office_location_id = ?
             AND room_id = ?
             AND provider_id = ?
             AND weekday = ?
             AND hour = ?
           ORDER BY is_active DESC, id DESC
           LIMIT 1`,
          [officeLocationId, roomIdFallback, providerIdFallback, wh.weekdayIndex, wh.hour]
        );
        if (rows?.[0]) {
          standingAssignmentId = Number(rows[0].id || 0) || null;
          if (!recurrenceGroupId && rows[0].recurrence_group_id) recurrenceGroupId = rows[0].recurrence_group_id;
        }
      }
    }
    if (!recurrenceGroupId && standingAssignmentId) {
      const [rows] = await pool.execute(
        `SELECT recurrence_group_id
         FROM office_standing_assignments
         WHERE id = ?
         LIMIT 1`,
        [standingAssignmentId]
      );
      recurrenceGroupId = rows?.[0]?.recurrence_group_id || null;
    }
    if (!standingAssignmentId && !recurrenceGroupId) {
      const updated = await OfficeEvent.cancelOccurrence({ eventId: eid });
      await ProviderVirtualSlotAvailability.deactivateBySourceEventId(eid);
      await cancelGoogleForOfficeEventIds([eid]);
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
    await cancelGoogleForOfficeEventIds(eventIds);

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
    const temporaryWeeksRaw = parseInt(req.body?.temporaryWeeks, 10);
    const temporaryWeeks = Number.isInteger(temporaryWeeksRaw) && temporaryWeeksRaw > 0 ? Math.min(temporaryWeeksRaw, 12) : 0;
    const recurrenceWeekdays = uniqueWeekdays(req.body?.weekdays, date);
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
           AND (status IS NULL OR UPPER(status) <> 'CANCELLED')
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
      if (!recurrenceWeekdays.length) {
        return res.status(400).json({ error: { message: 'At least one weekday is required for recurring assignment' } });
      }

      const assignedFrequency = recurrenceFrequency === 'BIWEEKLY' ? 'BIWEEKLY' : 'WEEKLY';
      const recurrenceGroupId = generateRecurrenceGroupId();
      const standingAssignments = [];
      const createdEvents = [];

      const startHour = Number(hour);
      const finalHour = Number(endHour !== null ? endHour : hour + 1);

      for (const weekday of recurrenceWeekdays) {
        for (let h = startHour; h < finalHour; h++) {
          // eslint-disable-next-line no-await-in-loop
          const existingStanding = await OfficeStandingAssignment.findActiveBySlot({
            officeLocationId,
            roomId,
            weekday,
            hour: h
          });
          if (existingStanding?.id) {
            return res.status(409).json({ error: { message: `Recurring slot already assigned for weekday ${weekday} hour ${h}.` } });
          }
        }
      }

      for (const weekday of recurrenceWeekdays) {
        for (let h = startHour; h < finalHour; h++) {
          // eslint-disable-next-line no-await-in-loop
          const standingAssignment = await OfficeStandingAssignment.create({
            officeLocationId,
            roomId,
            providerId: assignedUserId,
            weekday,
            hour: h,
            assignedFrequency,
            recurrenceGroupId,
            createdByUserId: req.user.id
          });

          // eslint-disable-next-line no-await-in-loop
          await OfficeStandingAssignment.update(standingAssignment.id, {
            available_since_date: date,
            last_two_week_confirmed_at: new Date(),
            ...(temporaryWeeks > 0
              ? {
                availability_mode: 'TEMPORARY',
                temporary_until_date: addDaysYmd(date, temporaryWeeks * 7)
              }
              : {})
          });
          standingAssignments.push(standingAssignment);
        }
      }

      // Create the clicked-day event immediately so the user sees feedback before next materialization.
      const clickedWeekday = weekdayIndexFromYmd(date);
      if (recurrenceWeekdays.includes(clickedWeekday)) {
        for (let h = startHour; h < finalHour; h++) {
          const standingForClickedDay = standingAssignments.find((a) => Number(a.weekday) === Number(clickedWeekday) && Number(a.hour) === Number(h)) || null;
          if (standingForClickedDay?.id) {
            const slotStartAt = mysqlDateTimeForDateHour(date, h);
            const slotEndAt = mysqlDateTimeForDateHour(date, h + 1);
            // eslint-disable-next-line no-await-in-loop
            const event = await OfficeEvent.upsertSlotState({
              officeLocationId,
              roomId,
              startAt: slotStartAt,
              endAt: slotEndAt,
              slotState: 'ASSIGNED_AVAILABLE',
              standingAssignmentId: standingForClickedDay.id,
              bookingPlanId: null,
              recurrenceGroupId,
              assignedProviderId: assignedUserId,
              bookedProviderId: null,
              createdByUserId: req.user.id
            });
            if (event?.id) createdEvents.push(event);
          }
        }
      }

      return res.json({
        ok: true,
        recurrenceFrequency,
        recurringUntilDate,
        recurrenceGroupId,
        weekdays: recurrenceWeekdays,
        standingAssignments,
        events: createdEvents
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
