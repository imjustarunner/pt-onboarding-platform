import { isExpiredTemporaryAssignment } from "./officeMoveConflict.js";
import { utcToZonedMysqlWall } from "./officeEventDateTime.util.js";
// Standing rows reserve a physical weekday/hour even when no booking event has
// been generated. Match the writer's ownership rules before offering a room.
export function approvalAssignmentConflict(
  request,
  room,
  window,
  inventory,
  now,
) {
  const today = utcToZonedMysqlWall(now, window.timezone).slice(0, 10);
  const owners = (inventory?.assignments || []).filter(
    (row) =>
      Number(row.room_id) === Number(room.roomId) &&
      Number(row.weekday) === window.weekday &&
      Number(row.hour) >= window.startHour &&
      Number(row.hour) < window.endHour &&
      !isExpiredTemporaryAssignment(row, today),
  );
  if (!owners.length) return null;
  // The intake writer can borrow a complete one-time window without replacing
  // its owner's standing assignment. Its booked occurrences were checked above.
  const canBorrow =
    request.source === "intake" &&
    request.recurrence === "ONCE" &&
    Array.from(
      { length: window.endHour - window.startHour },
      (_, i) => window.startHour + i,
    ).every((hour) =>
      owners.some(
        (row) =>
          Number(row.hour) === hour &&
          Number(row.provider_id) !== request.providerId,
      ),
    );
  if (
    canBorrow &&
    owners.every((row) => Number(row.provider_id) !== request.providerId)
  )
    return null;
  const owner = owners[0];
  const name =
    [owner.first_name, owner.last_name].filter(Boolean).join(" ") ||
    "a provider";
  return Number(owner.provider_id) === request.providerId
    ? "This provider already has a standing assignment here. Review or update that assignment in Building Master instead of creating another."
    : `This room has a standing assignment for ${name} during this time. Choose another room or review the existing assignment in Building Master.`;
}
