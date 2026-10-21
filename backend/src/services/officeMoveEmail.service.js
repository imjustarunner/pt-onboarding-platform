import { randomUUID } from "node:crypto";
import { utcToZonedMysqlWall } from "../utils/officeEventDateTime.util.js";

// Persist the provider receipt in the same transaction as the move. Sending uses
// the existing branded/batched office outbox after commit.
export async function queueOfficeMoveReceipt(
  db,
  {
    source,
    newRoomId,
    startAt,
    endAt,
    scope,
    timeZone,
    reason = "",
    actorUserId,
  },
) {
  const providerId = Number(
    source.provider_id ||
      source.booked_provider_id ||
      source.assigned_provider_id,
  );
  const [rooms] = await db.execute(
    `SELECT r.id,r.room_number,r.label,r.name,l.id office_id,l.name office_name,l.agency_id
    FROM office_rooms r JOIN office_locations l ON l.id=r.location_id WHERE r.id IN (?,?)`,
    [source.room_id, newRoomId],
  );
  const oldRoom = rooms.find((r) => Number(r.id) === Number(source.room_id));
  const room = rooms.find((r) => Number(r.id) === Number(newRoomId));
  const context =
    typeof source.session_context_json === "string"
      ? JSON.parse(source.session_context_json)
      : source.session_context_json;
  let agencyId = Number(source.booking_agency_id || context?.agencyId || 0);
  if (!agencyId) {
    const [[membership]] = await db.execute(
      `SELECT ua.agency_id FROM user_agencies ua
      JOIN office_location_agencies ola ON ola.agency_id=ua.agency_id
      WHERE ua.user_id=? AND ua.is_active=1 AND ola.office_location_id=? ORDER BY (ua.agency_id=?) DESC,ua.agency_id LIMIT 1`,
      [providerId, source.office_location_id, room?.agency_id || 0],
    );
    agencyId = Number(membership?.agency_id);
  }
  if (!providerId || !agencyId || !room || !oldRoom)
    throw new Error(
      "Unable to identify the provider’s office notification destination. No reservation was moved.",
    );
  const label = (r) =>
    r.room_number ? `Office #${r.room_number}` : r.label || r.name;
  const local = utcToZonedMysqlWall(startAt, timeZone),
    end = utcToZonedMysqlWall(endAt, timeZone);
  const oldStart = source.start_at
    ? utcToZonedMysqlWall(source.start_at, timeZone)
    : null;
  const oldTime = oldStart
    ? `${oldStart}–${utcToZonedMysqlWall(source.end_at, timeZone)?.slice(11, 16) || ""}`
    : `${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][source.weekday]} ${String(source.hour).padStart(2, "0")}:00–${String(Number(source.hour) + Number(source.block_hours || 1)).padStart(2, "0")}:00`;
  const payload = {
    key: `move:${randomUUID()}`,
    action: "move",
    officeId: room.office_id,
    roomId: Number(newRoomId),
    officeName: room.office_name,
    roomLabel: label(room),
    providerId,
    actorUserId,
    startDate: local.slice(0, 10),
    timezone: timeZone,
    recurrence:
      scope === "occurrence" ? "ONCE" : source.assigned_frequency || "WEEKLY",
    frequencyLabel:
      scope === "occurrence"
        ? "This occurrence only · the recurring schedule stays unchanged"
        : "All upcoming occurrences of this office time",
    slots: [
      {
        startHour: Number(local.slice(11, 13)),
        endHour: Number(end.slice(11, 13)) || 24,
      },
    ],
    previous: `${oldRoom.office_name} · ${label(oldRoom)} · ${oldTime} (${timeZone})`,
    comment: reason,
    sessions: [],
    clientLinked: !!source.client_id,
  };
  await db.execute(
    `INSERT INTO office_request_email_queue (kind,agency_id,user_id,request_key,payload_json,ready_at)
    VALUES ('decision',?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 MINUTE))`,
    [agencyId, providerId, payload.key, JSON.stringify(payload)],
  );
}
