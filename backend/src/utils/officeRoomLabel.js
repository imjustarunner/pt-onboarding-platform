/** A room's descriptive label is not its identifying office number. Keep both. */
export function officeRoomLabel(room = {}) {
  const number = String(room.room_number ?? room.roomNumber ?? '').trim();
  const name = String(room.room_label || room.label || room.room_name || room.name || '').trim();
  const identity = number ? `Room ${number}` : '';
  return [identity, name && name.toLowerCase() !== identity.toLowerCase() && name !== number ? name : ''].filter(Boolean).join(' · ') || 'Room';
}
