export const ANY_ROOM_NOTE = 'Room preference: Any available room; staff will choose one.';
export function confirmOneTimeRoom(frequency, confirm = message => window.confirm(message)) {
  return String(frequency || 'ONCE').toUpperCase() !== 'ONCE' || confirm('Are you sure you want this room for just one time? This will not repeat. Use “Recurring” for repeated scheduling, such as every Tuesday. Choose Cancel to change the recurrence.');
}
export function roomPreferenceContext(request) {
  if (request?.preferredRooms?.length) return 'Preferred rooms selected — staff assigns one';
  if (request?.slots?.some(slot => Number(slot.roomId)>0)) return 'Specific room requested';
  return String(request?.notes || '').includes(ANY_ROOM_NOTE) ? 'Any available room — confirmed by requester' : 'No room selected — confirm room preference';
}
