const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Recurrence controls choose days; the edited start/end time applies to each day.
// Do not expand recurring dates into duplicate weekly request windows.
export function officeRequestWindows({ baseDate, selected = [], recurrence = 'ONCE', recurrenceWeekdays = [], startHour, endHour, roomId }) {
  const baseWeekday = new Date(`${baseDate}T12:00:00Z`).getUTCDay();
  const selectedDays = [...new Set(selected.map(slot => {
    if (slot.dateYmd) return new Date(`${String(slot.dateYmd).slice(0, 10)}T12:00:00Z`).getUTCDay();
    return weekdays.indexOf(String(slot.dayName || '').slice(0, 3));
  }).filter(day => day >= 0 && day <= 6))];
  const recurringDays = recurrence !== 'ONCE'
    ? recurrenceWeekdays.map(day => weekdays.indexOf(String(day).slice(0, 3))).filter(day => day >= 0)
    : [];
  const days = [...new Set([
    ...(recurringDays.length ? recurringDays : [baseWeekday]),
    ...(selectedDays.length > 1 ? selectedDays : [])
  ])];
  return days.map(weekday => ({ weekday, startHour, endHour, roomId: Number(roomId) || undefined }));
}
