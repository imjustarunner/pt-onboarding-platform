// Notification presentation only: source audit rows and read/dismiss history stay intact.
export function consolidateSchoolEnrollmentNotifications(items) {
  const completed = new Map();
  for (const item of items) {
    if (item.kind !== 'intake_packet_submitted' || !Number(item.client_id)) continue;
    const key = Number(item.client_id);
    if (!completed.has(key)) completed.set(key, []);
    completed.get(key).push(new Date(item.created_at).getTime());
  }
  return items.filter(item => {
    const times = completed.get(Number(item.client_id));
    if (!times) return true;
    if (item.kind === 'client_created' && item._digitalEnrollmentCreated) return false;
    if (item.kind === 'client_event' && item._initialEnrollmentDetail) {
      const at = new Date(item.created_at).getTime();
      return !times.some(time => Number.isFinite(time) && Math.abs(time - at) <= 120000);
    }
    return true;
  }).map(({ _digitalEnrollmentCreated, _initialEnrollmentDetail, ...item }) => item);
}
