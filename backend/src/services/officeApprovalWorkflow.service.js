/** One approval contract for every office-request entry point.
 * Source records retain their IDs/history; adapters never copy a pending request
 * into another queue. All decisions (including old URLs) use this service.
 */
import pool from '../config/database.js';
import { approvalAssignmentConflict } from '../utils/officeAssignmentConflict.js';
export { approvalAssignmentConflict } from '../utils/officeAssignmentConflict.js';
import { pendingOfficeWindows, overlappingRequest } from './officeRoomAllocation.service.js';
import User from '../models/User.model.js';
import OfficeBookingRequest from '../models/OfficeBookingRequest.model.js';
import OfficeRoomRequest from '../models/OfficeRoomRequest.model.js';
import OfficeLocationAgency from '../models/OfficeLocationAgency.model.js';
import Notification from '../models/Notification.model.js';
import { readProviderCalendarBusy } from './providerCalendarBusy.service.js';
import {
  utcToZonedMysqlWall,
  mysqlDateTimeForDateHour,
  toMysqlUtcDateTime
} from '../utils/officeEventDateTime.util.js';
import {
  generateOccurrenceDates,
  recurrenceLabel
} from '../utils/scheduleRecurrence.js';
import {
  validateOfficeSlotSeries,
  loadOfficeSlotInventory
} from './officeSlotSeries.service.js';

const managers = new Set([
  'super_admin',
  'superadmin',
  'admin',
  'support',
  'staff',
  'clinical_practice_assistant',
  'provider_plus'
]);
const entities = {
  booking: 'office_booking_request',
  intake: 'provider_office_availability_request',
  legacy: 'office_room_request'
};
const fail = (message, status = 409) =>
  Object.assign(new Error(message), { status });
const array = (value) => {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
const ymd = (value) =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value || '').slice(0, 10);
export function parseOfficeApprovalKey(key) {
  const match = /^(booking|intake|legacy):([1-9]\d*)$/.exec(String(key));
  if (!match || !Number.isSafeInteger(Number(match[2])))
    throw fail('Invalid office request.', 400);
  return { source: match[1], id: Number(match[2]) };
}
async function scope(actor) {
  if (!managers.has(String(actor?.role)))
    throw fail('Only schedule managers can review office requests.', 403);
  const all = ['super_admin', 'superadmin'].includes(actor.role);
  const agencies = all
    ? (await pool.execute('SELECT id FROM agencies'))[0]
    : await User.getAgencies(actor.id);
  return agencies.map((a) => Number(a.id));
}
function normalize(source, row) {
  const intake = source === 'intake';
  const timezone = row.office_timezone || 'America/Denver';
  const start = !intake ? utcToZonedMysqlWall(row.start_at, timezone) : null;
  const end = !intake ? utcToZonedMysqlWall(row.end_at, timezone) : null;
  const slots = intake
    ? row.slots
    : [
        {
          startHour:
            Number(start?.slice(11, 13)) + Number(start?.slice(14, 16)) / 60,
          endHour:
            end?.slice(0, 10) !== start?.slice(0, 10)
              ? 24
              : Number(end?.slice(11, 13)) + Number(end?.slice(14, 16)) / 60,
          roomId: row.room_id
        }
      ];
  const recurrence = intake
    ? row.requested_frequency || 'ONCE'
    : row.recurrence || 'ONCE';
  // Existing weekly office requests are standing reservations without a six-week cutoff.
  const occurrenceCount =
    recurrence === 'ONCE'
      ? 1
      : recurrence === 'WEEKLY' && !row.client_id
        ? null
        : Number(
            intake
              ? row.requested_occurrence_count
              : row.booked_occurrence_count
          ) || null;
  const sourceLabel = intake
    ? 'Availability request'
    : source === 'legacy'
      ? 'Room request'
      : String(row.requester_notes || '').includes('Provider Update')
        ? 'Provider Update'
        : 'Calendar request';
  return {
    key: `${source}:${row.id}`,
    source,
    id: Number(row.id),
    agencyId: Number(row.agency_id) || null,
    providerId: Number(
      row.provider_id || row.requested_provider_id || row.user_id
    ),
    providerName: [
      row.provider_first_name ||
        row.requester_first_name ||
        row.user_first_name,
      row.provider_last_name || row.requester_last_name || row.user_last_name
    ]
      .filter(Boolean)
      .join(' '),
    sourceLabel,
    status: row.status,
    createdAt: row.created_at,
    officeId: Number(row.office_location_id || row.location_id) || null,
    officeName: row.office_location_name || row.location_name || '',
    preferredOfficeIds: array(row.preferred_office_ids_json).map(Number),
    preferredRooms: array(row.preferred_rooms_json),
    roomId: Number(slots?.[0]?.roomId) || null,
    roomLabel: row.room_label || row.room_name || '',
    startDate: intake ? ymd(row.requested_start_date) : start?.slice(0, 10),
    timezone,
    slots,
    recurrence,
    occurrenceCount,
    frequencyLabel: recurrenceLabel(recurrence, occurrenceCount),
    notes: String(row.notes || row.requester_notes || ''),
    requestType: row.request_type || 'PROVIDER_REQUEST',
    roomRequest:
      intake ||
      source === 'legacy' ||
      ['PROVIDER_REQUEST', 'INTAKE_REQUEST'].includes(row.request_type),
    clientLinked: !!row.client_id,
    openToAlternativeRoom:
      intake || !!row.open_to_alternative_room || !row.room_id
  };
}

export async function listOfficeApprovals(actor) {
  const ids = await scope(actor);
  if (!ids.length) return [];
  const [bookings, legacy, [intake]] = await Promise.all([
    OfficeBookingRequest.listPendingForAgencies(ids),
    OfficeRoomRequest.listPendingForAgencies(ids),
    pool.execute(
      `SELECT r.*,u.first_name AS provider_first_name,u.last_name AS provider_last_name
      FROM provider_office_availability_requests r JOIN users u ON u.id=r.provider_id
      WHERE r.status='PENDING' AND r.agency_id IN (${ids.map(() => '?')})`,
      ids
    )
  ]);
  if (intake.length) {
    const [slots] = await pool.execute(
      `SELECT request_id,weekday,start_hour AS startHour,end_hour AS endHour,room_id AS roomId
      FROM provider_office_availability_request_slots WHERE request_id IN (${intake.map(() => '?')}) ORDER BY weekday,start_hour`,
      intake.map((r) => r.id)
    );
    for (const r of intake)
      r.slots = slots.filter((s) => Number(s.request_id) === Number(r.id));
  }
  return [
    ...bookings.map((r) => normalize('booking', r)),
    ...intake.map((r) => normalize('intake', r)),
    ...legacy.map((r) => normalize('legacy', r))
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}
export async function findOfficeApproval(actor, key) {
  parseOfficeApprovalKey(key);
  const request = (await listOfficeApprovals(actor)).find((r) => r.key === key);
  if (!request)
    throw fail(
      'This request has already been resolved or is not available to you.',
      404
    );
  return request;
}

// Keep the original cadence when a request waited for approval. Never create a
// retroactive reservation, move a biweekly anchor, or restart a finite series.
export function approvalWindow(request, timezone, now = new Date()) {
  if (request.slots.length !== 1)
    throw fail(
      'This older request contains several time windows. Separate and review each window before approval.'
    );
  const { startHour, endHour } = request.slots[0];
  if (
    !Number.isInteger(startHour) ||
    !Number.isInteger(endHour) ||
    startHour < 0 ||
    endHour > 24 ||
    endHour <= startHour
  )
    throw fail('Office reservations must start and end on whole hours.', 400);
  const today = utcToZonedMysqlWall(now, timezone).slice(0, 10);
  const dates = generateOccurrenceDates({
    startDate: request.startDate,
    recurrence: request.recurrence,
    occurrenceCount: request.occurrenceCount ?? 520,
    now
  });
  const remaining = dates.filter(
    (date) =>
      date >= today &&
      mysqlDateTimeForDateHour(date, endHour, timezone) >
        toMysqlUtcDateTime(now)
  );
  if (!remaining.length)
    throw fail(
      'These requested dates have ended. Deny this request and ask for new dates; approving will not create a past booking.'
    );
  if (
    request.recurrence === 'MONTHLY' &&
    remaining[0].slice(8) !== request.startDate.slice(8)
  )
    throw fail(
      'This older monthly request starts on a month-end date. Confirm a new request with the provider so its day-of-month is preserved.'
    );
  const checkedDates = remaining;
  return {
    startDate: remaining[0],
    startHour,
    endHour,
    weekday: new Date(`${remaining[0]}T12:00:00Z`).getUTCDay(),
    recurrence: request.recurrence,
    occurrenceCount: request.occurrenceCount == null ? null : remaining.length,
    checkedDates,
    originalStartDate: request.startDate,
    timezone
  };
}
async function candidateRooms(actor, request) {
  const agencies = await scope(actor);
  const officeIds = request.officeId
    ? [request.officeId]
    : request.preferredOfficeIds;
  const params = [...agencies];
  let where = `ola.agency_id IN (${agencies.map(() => '?')})`;
  if (officeIds.length) {
    where += ` AND l.id IN (${officeIds.map(() => '?')})`;
    params.push(...officeIds);
  }
  if (request.source === 'intake') {
    where += ' AND ola.agency_id=?';
    params.push(request.agencyId);
  }
  const [rooms] = await pool.execute(
    `SELECT DISTINCT rm.id AS roomId,l.id AS officeId,l.name AS officeName,l.timezone,
    rm.room_number,rm.label,rm.name,(SELECT GROUP_CONCAT(t.name SEPARATOR ' · ') FROM office_room_type_links k JOIN office_room_types t ON t.id=k.room_type_id AND t.is_active=1 WHERE k.room_id=rm.id) AS roomType FROM office_rooms rm JOIN office_locations l ON l.id=rm.location_id
    JOIN office_location_agencies ola ON ola.office_location_id=l.id
    WHERE ${where} AND rm.is_active=1 AND l.is_active=1 AND l.physical_office_location_id IS NULL ORDER BY l.name,rm.room_number,rm.id`,
    params
  );
  return rooms.map((r) => ({
    ...r,
    roomLabel: r.room_number ? `Office #${r.room_number}` : r.label || r.name,
    requested:
      Number(r.roomId) === request.roomId ||
      request.preferredRooms.some((p) => Number(p.id) === Number(r.roomId))
  }));
}
async function reviewRoom(request, room, now, inventory) {
  const timezone = room.timezone || 'America/Denver';
  let window;
  try {
    window = approvalWindow(request, timezone, now);
  } catch (error) {
    return { ...room, available: false, reason: error.message };
  }
  const checked = await validateOfficeSlotSeries({
    pool,
    providerId: request.providerId,
    roomId: room.roomId,
    officeLocationId: room.officeId,
    ...window,
    officeTimeZone: timezone,
    inventory,
    occurrenceDates: window.checkedDates
  });
  const assignmentReason = checked.ok
    ? approvalAssignmentConflict(request, room, window, inventory, now)
    : null;
  return {
    ...room,
    window,
    available: checked.ok && !assignmentReason,
    reason: checked.error?.message || assignmentReason || '',
    blockedDate: checked.error?.blockedDate || null
  };
}
export async function officeApprovalContext(
  actor,
  key,
  { roomId = null, selectedOnly = false, now = new Date() } = {}
) {
  parseOfficeApprovalKey(key);
  const pending = await listOfficeApprovals(actor);
  const request = pending.find((row) => row.key === key);
  if (!request)
    throw fail(
      'This request has already been resolved or is not available to you.',
      404
    );
  if (!request.roomRequest)
    return { request, rooms: [], warnings: [], special: true };
  const eligible = await candidateRooms(actor, request);
  const candidates =
    selectedOnly && roomId
      ? eligible.filter((r) => Number(r.roomId) === Number(roomId))
      : eligible;
  const bounds = candidates.flatMap((room) => {
    try {
      const w = approvalWindow(request, room.timezone || 'America/Denver', now);
      return [
        {
          start: mysqlDateTimeForDateHour(
            w.checkedDates[0],
            w.startHour,
            w.timezone
          ),
          end: mysqlDateTimeForDateHour(
            w.checkedDates.at(-1),
            w.endHour,
            w.timezone
          )
        }
      ];
    } catch {
      return [];
    }
  });
  const inventory = bounds.length
    ? await loadOfficeSlotInventory(pool, {
        roomIds: candidates.map((r) => r.roomId),
        startAt: bounds.map((b) => b.start).sort()[0],
        endAt: bounds
          .map((b) => b.end)
          .sort()
          .at(-1)
      })
    : null;
  const rooms = await Promise.all(
    candidates.map((r) => reviewRoom(request, r, now, inventory))
  );
  // Room holds apply across agencies sharing the physical building. Do not expose
  // the other agency's provider or client information while enforcing the hold.
  const holdsByOffice = new Map();
  for (const candidate of rooms) {
    if (!candidate.available || !candidate.window) continue;
    if (!holdsByOffice.has(candidate.officeId)) holdsByOffice.set(candidate.officeId,
      await pendingOfficeWindows(pool, { officeId: candidate.officeId, timeZone: candidate.window.timezone }));
    if (holdsByOffice.get(candidate.officeId).some(other => other.key !== key &&
      Number(other.roomId) === Number(candidate.roomId) && overlappingRequest(candidate.window, other))) {
      candidate.available = false;
      candidate.reason = 'Held by another pending office request. Choose another room.';
    }
  }
  const selected =
    rooms.find((r) => Number(r.roomId) === Number(roomId || request.roomId)) ||
    null;
  const window = selected?.window || rooms.find((r) => r.window)?.window;
  const warnings = [];
  if (window) {
    // Other room reservations are useful context, not an automatic ban on
    // reserving a room for an already-scheduled client appointment.
    const first = mysqlDateTimeForDateHour(
      window.checkedDates[0],
      window.startHour,
      window.timezone
    );
    const last = mysqlDateTimeForDateHour(
      window.checkedDates.at(-1),
      window.endHour,
      window.timezone
    );
    const [events] = await pool.execute(
      `SELECT e.id,e.start_at,e.end_at,l.name AS officeName,r.label AS roomLabel,e.room_id AS roomId
      FROM office_events e JOIN office_locations l ON l.id=e.office_location_id JOIN office_rooms r ON r.id=e.room_id
      WHERE COALESCE(e.booked_provider_id,e.assigned_provider_id)=? AND e.start_at<? AND e.end_at>?
      AND (e.status IS NULL OR e.status<>'CANCELLED') AND (e.status='BOOKED' OR e.slot_state IN ('ASSIGNED_BOOKED','COMPANY_HOLD'))`,
      [request.providerId, last, first]
    );
    for (const e of events)
      if (
        window.checkedDates.some(
          (date) =>
            toMysqlUtcDateTime(e.start_at) <
              mysqlDateTimeForDateHour(date, window.endHour, window.timezone) &&
            toMysqlUtcDateTime(e.end_at) >
              mysqlDateTimeForDateHour(date, window.startHour, window.timezone)
        )
      )
        warnings.push({
          kind: 'existing_reservation',
          roomId: Number(e.roomId),
          message: `Already reserved: ${e.officeName} · ${e.roomLabel || 'office room'}`,
          startAt: toMysqlUtcDateTime(e.start_at)
        });
    const overlaps = (start, end) =>
      window.checkedDates.some(
        (date) =>
          toMysqlUtcDateTime(start) <
            mysqlDateTimeForDateHour(date, window.endHour, window.timezone) &&
          toMysqlUtcDateTime(end) >
            mysqlDateTimeForDateHour(date, window.startHour, window.timezone)
      );
    const busy = await readProviderCalendarBusy(pool, {
      providerId: request.providerId,
      startAt: first,
      endAt: last,
      timeZone: window.timezone
    });
    for (const event of busy)
      if (overlaps(event.start, event.end))
        warnings.push({
          kind: 'calendar',
          message: 'Meeting or personal commitment in the app',
          startAt: toMysqlUtcDateTime(event.start)
        });
    const [appointments] = await pool.execute(
      `SELECT start_at,end_at FROM appointments WHERE provider_user_id=? AND start_at<? AND end_at>?
      AND status NOT IN ('canceled_by_provider','canceled_by_client','canceled_by_guardian','canceled_by_organization','late_canceled','rescheduled','voided')`,
      [request.providerId, last, first]
    );
    for (const event of appointments)
      if (overlaps(event.start_at, event.end_at))
        warnings.push({
          kind: 'appointment',
          message:
            'Client appointment already scheduled (confirm this room is for that session)',
          startAt: toMysqlUtcDateTime(event.start_at)
        });
    const [schools] = await pool.execute(
      `SELECT day_of_week,start_time,end_time FROM provider_school_assignments WHERE provider_user_id=? AND is_active=TRUE`,
      [request.providerId]
    );
    for (const school of schools)
      for (const date of window.checkedDates) {
        const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
        const day = [
          'sunday',
          'monday',
          'tuesday',
          'wednesday',
          'thursday',
          'friday',
          'saturday'
        ][weekday];
        const startHour =
          Number(String(school.start_time).slice(0, 2)) +
          Number(String(school.start_time).slice(3, 5)) / 60;
        const endHour =
          Number(String(school.end_time).slice(0, 2)) +
          Number(String(school.end_time).slice(3, 5)) / 60;
        if (
          String(school.day_of_week).toLowerCase() === day &&
          startHour < window.endHour &&
          endHour > window.startHour
        )
          warnings.push({
            kind: 'school',
            message: 'Time is assigned to school clients',
            startAt: mysqlDateTimeForDateHour(
              date,
              window.startHour,
              window.timezone
            )
          });
      }
    for (const other of pending) {
      if (other.key === key || !other.roomRequest || other.slots.length !== 1)
        continue;
      if (
        other.officeId &&
        !candidates.some((room) => Number(room.officeId) === other.officeId)
      )
        continue;
      const sameProvider = other.providerId === request.providerId;
      if (
        !sameProvider &&
        (!other.roomId ||
          !candidates.some((room) => Number(room.roomId) === other.roomId))
      )
        continue;
      let otherWindow;
      try {
        otherWindow = approvalWindow(other, window.timezone, now);
      } catch {
        continue;
      }
      if (
        otherWindow.startHour >= window.endHour ||
        otherWindow.endHour <= window.startHour
      )
        continue;
      const overlappingDate = window.checkedDates.find((date) =>
        otherWindow.checkedDates.includes(date)
      );
      if (!overlappingDate) continue;
      if (other.roomId) {
        for (const candidate of rooms) if (candidate.available && Number(candidate.roomId) === Number(other.roomId)) {
          candidate.available = false;
          candidate.reason = 'Held by another pending office request. Resolve that request or choose another room.';
        }
      }
      warnings.push({
        kind: 'pending_request',
        requestKey: other.key,
        message: `Another pending request for ${other.providerName || 'this provider'} (${other.sourceLabel}, #${other.id}) overlaps this time${other.roomLabel ? ' in ' + other.roomLabel : ''}. Review both before approving.`,
        startAt: mysqlDateTimeForDateHour(
          overlappingDate,
          otherWindow.startHour,
          window.timezone
        )
      });
    }
    // A second reservation in the exact room is not a useful alternative.
    for (const room of rooms)
      if (
        warnings.some(
          (w) =>
            w.kind === 'existing_reservation' &&
            w.roomId === Number(room.roomId)
        )
      ) {
        room.available = false;
        room.reason =
          'This provider already has this room reserved during the requested dates. Review the existing reservation instead of approving a duplicate.';
      }
  }
  return {
    request,
    rooms,
    selectedRoomId: selected?.roomId || null,
    window,
    warnings,
    checkedAt: new Date().toISOString(),
    horizon:
      request.occurrenceCount == null
        ? 'All occurrences within the next year; the standing reservation continues.'
        : 'All remaining requested occurrences.'
  };
}

// One database lock serializes decisions across both APIs and all app instances.
// Booking writes still use the existing canonical assignment/materializer pipeline.
export async function withOfficeDecisionLock(work) {
  const db = await pool.getConnection();
  let locked = false;
  try {
    const [[row]] = await db.execute(
      "SELECT GET_LOCK('office-request-decision',8) AS acquired"
    );
    if (Number(row?.acquired) !== 1)
      throw fail('Another office request is being decided. Please retry.');
    locked = true;
    return await work();
  } finally {
    if (locked)
      await db
        .execute("SELECT RELEASE_LOCK('office-request-decision')")
        .catch(() => {});
    db.release();
  }
}

export async function notifyOfficeRequestPending({
  source,
  id,
  providerId,
  officeId,
  agencyId
}) {
  const entity = entities[source];
  if (!entity) throw fail('Invalid request source.', 400);
  const { queueOfficeRequestReview } = await import('./officeRequestEmails.service.js');
  await queueOfficeRequestReview({ source, id, providerId, officeId, agencyId });
  const agencies = agencyId
    ? [{ id: agencyId }]
    : await OfficeLocationAgency.listAgenciesForOffice(officeId);
  const user = await User.findById(providerId);
  const name =
    [user?.first_name, user?.last_name].filter(Boolean).join(' ') ||
    'A provider';
  for (const agency of agencies) {
    const [[existing]] = await pool.execute(
      'SELECT id FROM notifications WHERE type=? AND related_entity_type=? AND related_entity_id=? AND agency_id=? LIMIT 1',
      ['office_availability_request_pending', entity, id, agency.id]
    );
    if (existing) continue;
    await Notification.create({
      type: 'office_availability_request_pending',
      severity: 'info',
      title: 'Office request pending',
      message: `${name} requested office time. Review the room options and conflicts in Office Approvals.`,
      audienceJson: {
        admin: true,
        clinicalPracticeAssistant: true,
        schoolStaff: false,
        provider: false,
        supervisor: false
      },
      userId: null,
      agencyId: agency.id,
      relatedEntityType: entity,
      relatedEntityId: id,
      actorUserId: providerId
    });
  }
}
export async function resolveOfficeRequestAlerts(key) {
  const { source, id } = parseOfficeApprovalKey(key);
  await pool.execute(
    'UPDATE notifications SET is_resolved=TRUE WHERE type=? AND related_entity_type=? AND related_entity_id=?',
    ['office_availability_request_pending', entities[source], id]
  );
}

export async function officeDecisionAgency(request) {
  if (request.agencyId) return request.agencyId;
  const [offices, memberships] = await Promise.all([
    OfficeLocationAgency.listAgenciesForOffice(request.officeId),
    User.getAgencies(request.providerId)
  ]);
  return (
    Number(
      offices.find((a) =>
        memberships.some((m) => Number(m.id) === Number(a.id))
      )?.id
    ) || null
  );
}
export async function notifyOfficeDecision({
  request,
  action,
  selected,
  actorId,
  comment,
  agencyId,
  result
}) {
  if (!agencyId || !request.roomRequest) return;
  const { queueOfficeDecisionEmail } = await import('./officeRequestEmails.service.js');
  await queueOfficeDecisionEmail({ request, action, selected, comment, agencyId, result });
  const description = selected
    ? `${selected.officeName} · ${selected.roomLabel}, starting ${selected.window.startDate}, ${selected.window.startHour}:00–${selected.window.endHour}:00 (${selected.timezone}), ${request.frequencyLabel}`
    : `${request.frequencyLabel}, starting ${request.startDate}`;
  await Notification.create({
    type: 'office_request_decided',
    severity: 'info',
    title:
      action === 'approve'
        ? 'Office request approved'
        : 'Office request denied',
    message: `Your office request was ${action === 'approve' ? 'approved' : 'denied'}: ${description}.${comment ? ' ' + String(comment).slice(0, 2000) : ''}`,
    userId: request.providerId,
    agencyId,
    relatedEntityType: entities[request.source],
    relatedEntityId: request.id,
    actorUserId: actorId
  });
}
