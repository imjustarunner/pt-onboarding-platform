export function officeRoomTitle(room = {}) {
  const number = room.roomNumber ?? room.room_number;
  return number != null && number !== ""
    ? `Office #${number}`
    : room.label || room.name || room.roomLabel || "Office";
}
