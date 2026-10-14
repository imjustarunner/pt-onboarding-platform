// A building-wide request needs ONE room. Do not turn it into a soft hold on
// every room; keep it in the building queue until staff chooses a room.
export function indexPendingRoomRequest(pendingBySlot, unassigned, request) {
  if (!request.roomId) {
    unassigned.set(`${request.id}:${request.date}:${request.startHour}:${request.endHour}`,request);
    return;
  }
  for(let hour=request.startHour;hour<request.endHour;hour++) {
    const key=`${request.date}:${hour}:${request.roomId}`;
    if(!pendingBySlot.has(key))pendingBySlot.set(key,[]);
    pendingBySlot.get(key).push(request);
  }
}
