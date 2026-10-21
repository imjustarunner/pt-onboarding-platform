import { approvalAssignmentConflict } from "../utils/officeAssignmentConflict.js";
import {
  generateOccurrenceDates,
  addDaysYmd,
  addMonthsYmd,
  stepDaysForRecurrence,
} from "../utils/scheduleRecurrence.js";
import {
  mysqlDateTimeForDateHour,
  utcToZonedMysqlWall,
} from "../utils/officeEventDateTime.util.js";
import {
  loadOfficeSlotInventory,
  validateOfficeSlotSeries,
} from "./officeSlotSeries.service.js";
const fail = (message, extra = {}) =>
  Object.assign(new Error(message), { status: 409, ...extra });
const parse = (value) =>
  typeof value === "string" ? JSON.parse(value || "[]") : value || [];
const date = (value) =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
export const ROOM_TYPES = ["counseling", "play", "tutoring", "group"];
export function roomCategory(room) {
  const labels =
    `${room.type_names || ""} ${room.label || ""} ${room.name || ""}`.toLowerCase();
  // Specialty designations win: a Play/Counseling room is never a general-office fallback.
  if (/play|day.?care/.test(labels)) return "play";
  if (/tutor|learning/.test(labels)) return "tutoring";
  if (/group|conference/.test(labels)) return "group";
  if (/counsel|therapy room/.test(labels)) return "counseling";
  return "other";
}
export function rankOfficeRooms(
  rooms,
  history,
  { roomId, preferredRoomIds = [], roomType = "counseling" },
) {
  const byId = new Map(history.map((h) => [Number(h.room_id), h]));
  return rooms
    .filter((r) =>
      roomId ? Number(r.id) === Number(roomId) : roomCategory(r) === roomType,
    )
    .sort((a, b) => {
      const pref = (id) =>
        preferredRoomIds.includes(Number(id))
          ? preferredRoomIds.indexOf(Number(id))
          : 999;
      return (
        pref(a.id) - pref(b.id) ||
        Number(!!byId.get(Number(b.id))) - Number(!!byId.get(Number(a.id))) ||
        String(byId.get(Number(b.id))?.last_used || "").localeCompare(
          String(byId.get(Number(a.id))?.last_used || ""),
        ) ||
        Number(a.id) - Number(b.id)
      );
    });
}
export function requestDates(startDate, recurrence, occurrenceCount) {
  return generateOccurrenceDates({
    startDate,
    recurrence,
    occurrenceCount: recurrence === "ONCE" ? 1 : occurrenceCount || 104,
  });
}
export function requestOccursOnDate(request, day) {
  if (!request.startDate || day < request.startDate) return false;
  const recurrence = request.recurrence || "ONCE";
  if (recurrence === "ONCE") return day === request.startDate;
  const months =
    (Number(day.slice(0, 4)) - Number(request.startDate.slice(0, 4))) * 12 +
    Number(day.slice(5, 7)) -
    Number(request.startDate.slice(5, 7));
  const step = stepDaysForRecurrence(recurrence);
  const index =
    recurrence === "MONTHLY"
      ? months
      : step
        ? Math.round(
            (Date.parse(day) - Date.parse(request.startDate)) / 86400000,
          ) / step
        : -1;
  if (
    index < 0 ||
    !Number.isInteger(index) ||
    (request.occurrenceCount && index >= Number(request.occurrenceCount))
  )
    return false;
  return (
    recurrence !== "MONTHLY" || addMonthsYmd(request.startDate, index) === day
  );
}
export function overlappingRequest(a, b) {
  if (!(a.startHour < b.endHour && a.endHour > b.startHour)) return false;
  const first = a.startDate > b.startDate ? a.startDate : b.startDate;
  // Scan from the overlap boundary, so an old open-ended anchor never expires
  // merely because its first 104 weeks are in the past.
  for (let i = 0; i <= 366; i++) {
    const day = addDaysYmd(first, i);
    if (requestOccursOnDate(a, day) && requestOccursOnDate(b, day)) return true;
  }
  return false;
}
export async function pendingOfficeWindows(db, { officeId, timeZone }) {
  const [bookings] = await db.execute(
    `SELECT id,requested_provider_id,room_id,start_at,end_at,recurrence,booked_occurrence_count FROM office_booking_requests
    WHERE office_location_id=? AND status='PENDING' AND request_type IN ('PROVIDER_REQUEST','INTAKE_REQUEST')`,
    [officeId],
  );
  const timed = (row, source) => {
    const start = utcToZonedMysqlWall(row.start_at, timeZone),
      end = utcToZonedMysqlWall(row.end_at, timeZone);
    return {
      key: `${source}:${row.id}`,
      providerId: Number(row.requested_provider_id || row.user_id),
      roomId: Number(row.room_id),
      startDate: start.slice(0, 10),
      startHour: Number(start.slice(11, 13)) + Number(start.slice(14, 16)) / 60,
      endHour:
        (end.slice(0, 10) > start.slice(0, 10)
          ? 24
          : Number(end.slice(11, 13))) +
        Number(end.slice(14, 16)) / 60,
      recurrence:
        row.recurrence ||
        (row.request_type === "RECURRING" ? "WEEKLY" : "ONCE"),
      occurrenceCount: row.booked_occurrence_count,
    };
  };
  const pending = bookings.map((row) => timed(row, "booking"));
  const [legacy] = await db.execute(
    "SELECT * FROM office_room_requests WHERE location_id=? AND status='PENDING'",
    [officeId],
  );
  pending.push(...legacy.map((row) => timed(row, "legacy")));
  const [intakes] =
    await db.execute(`SELECT r.id,r.provider_id,r.preferred_office_ids_json,r.requested_start_date,r.requested_frequency,r.requested_occurrence_count,s.weekday,s.start_hour,s.end_hour,s.room_id
    FROM provider_office_availability_requests r JOIN provider_office_availability_request_slots s ON s.request_id=r.id WHERE r.status='PENDING'`);
  for (const row of intakes) {
    if (
      !Number.isInteger(Number(row.weekday)) ||
      row.weekday == null ||
      Number(row.weekday) < 0 ||
      Number(row.weekday) > 6
    )
      continue;
    const offices = parse(row.preferred_office_ids_json).map(Number);
    if (offices.length && !offices.includes(Number(officeId))) continue;
    const startDate = date(row.requested_start_date),
      base = new Date(`${startDate}T12:00:00Z`);
    if (Number.isNaN(+base)) continue;
    base.setUTCDate(
      base.getUTCDate() + ((Number(row.weekday) - base.getUTCDay() + 7) % 7),
    );
    pending.push({
      key: `intake:${row.id}`,
      providerId: Number(row.provider_id),
      roomId: Number(row.room_id),
      startDate: base.toISOString().slice(0, 10),
      startHour: Number(row.start_hour),
      endHour: Number(row.end_hour),
      recurrence: row.requested_frequency,
      occurrenceCount: row.requested_occurrence_count,
    });
  }
  return pending;
}
export async function lockOfficeRequests(db) {
  const [[row]] = await db.execute(
    "SELECT GET_LOCK('office-request-decision',8) AS acquired",
  );
  if (Number(row?.acquired) !== 1)
    throw fail("Another office request is being saved. Please retry.");
}
export async function unlockOfficeRequests(db) {
  await db.execute("SELECT RELEASE_LOCK('office-request-decision')");
}
// Called inside the shared office-request lock and the writer's transaction.
export async function allocateOfficeRoom(db, input) {
  if (!ROOM_TYPES.includes(input.roomType || "counseling"))
    throw fail("Choose a valid office type.");
  const [rooms] = await db.execute(
    `SELECT r.*,l.timezone,(SELECT GROUP_CONCAT(t.name) FROM office_room_type_links k JOIN office_room_types t ON t.id=k.room_type_id AND t.is_active=1 WHERE k.room_id=r.id) type_names FROM office_rooms r JOIN office_locations l ON l.id=r.location_id WHERE r.location_id=? AND r.is_active=1 AND l.is_active=1`,
    [input.officeId],
  );
  const [history] = await db.execute(
    `SELECT room_id,MAX(start_at) last_used FROM office_events
    WHERE office_location_id=? AND COALESCE(booked_provider_id,assigned_provider_id)=?
      AND start_at < UTC_TIMESTAMP() AND status='BOOKED' GROUP BY room_id`,
    [input.officeId, input.providerId],
  );
  const timezone = rooms[0]?.timezone || "America/Denver";
  const window = { ...input };
  if (input.startAt) {
    const start = utcToZonedMysqlWall(input.startAt, timezone),
      end = utcToZonedMysqlWall(input.endAt, timezone);
    if (
      !start ||
      !end ||
      start.slice(14, 19) !== "00:00" ||
      end.slice(14, 19) !== "00:00" ||
      (end.slice(0, 10) !== start.slice(0, 10) &&
        !(
          end.slice(0, 10) === addDaysYmd(start.slice(0, 10), 1) &&
          end.slice(11) === "00:00:00"
        ))
    )
      throw fail(
        "Office requests must start and end on the hour within one day.",
        { status: 400 },
      );
    Object.assign(window, {
      startDate: start.slice(0, 10),
      startHour: Number(start.slice(11, 13)),
      endHour:
        end.slice(0, 10) > start.slice(0, 10) ? 24 : Number(end.slice(11, 13)),
    });
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(window.startDate || "") ||
    !Number.isInteger(window.startHour) ||
    !Number.isInteger(window.endHour) ||
    window.startHour < 0 ||
    window.endHour > 24 ||
    window.endHour <= window.startHour
  )
    throw fail(
      "Office requests must start and end on the hour within one day.",
      { status: 400 },
    );
  const pending = (
    await pendingOfficeWindows(db, {
      officeId: input.officeId,
      timeZone: timezone,
    })
  ).filter((p) => p.key !== input.excludeRequestKey);
  const overlaps = pending.filter((p) => overlappingRequest(window, p));
  const duplicate = overlaps.find(
    (p) => p.providerId === Number(input.providerId),
  );
  if (duplicate)
    throw fail(
      "You already have a pending office request for this time. Open that request to change it.",
      { code: "ALREADY_REQUESTED", requestKey: duplicate.key },
    );
  const ranked = rankOfficeRooms(rooms, history, input);
  const dates = requestDates(
    window.startDate,
    input.recurrence,
    input.occurrenceCount,
  );
  if (!dates.length)
    throw fail("Choose a date within the next year.", { status: 400 });
  const inventory = await loadOfficeSlotInventory(db, {
    roomIds: ranked.map((r) => r.id),
    startAt: mysqlDateTimeForDateHour(dates[0], window.startHour, timezone),
    endAt: mysqlDateTimeForDateHour(dates.at(-1), window.endHour, timezone),
  });
  for (const room of ranked) {
    if (overlaps.some((p) => p.roomId === Number(room.id))) continue;
    const checked = await validateOfficeSlotSeries({
      pool: db,
      providerId: input.providerId,
      roomId: room.id,
      officeLocationId: input.officeId,
      startDate: window.startDate,
      startHour: window.startHour,
      endHour: window.endHour,
      weekday: new Date(`${window.startDate}T12:00:00Z`).getUTCDay(),
      recurrence: input.recurrence,
      occurrenceCount: input.occurrenceCount || 104,
      officeTimeZone: timezone,
      inventory,
    });
    const ownershipConflict =
      checked.ok &&
      approvalAssignmentConflict(
        {
          providerId: Number(input.providerId),
          source: input.source || "booking",
          recurrence: input.recurrence,
        },
        { roomId: room.id },
        {
          ...window,
          timezone,
          weekday: new Date(`${window.startDate}T12:00:00Z`).getUTCDay(),
        },
        inventory,
        new Date(),
      );
    if (checked.ok && !ownershipConflict)
      return {
        ...window,
        roomId: Number(room.id),
        roomLabel: room.label || room.name,
        roomType: input.roomType || "counseling",
      };
  }
  throw fail(
    input.roomId
      ? "This office is unavailable for one or more requested dates. Choose another room or time."
      : "No suitable office is available for the full requested schedule. Choose another time or ask the CPA for help.",
    { code: "NO_SUITABLE_OFFICE" },
  );
}
