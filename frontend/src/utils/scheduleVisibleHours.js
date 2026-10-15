/** All-day dates use an exclusive end date, matching the calendar API. */
export function isAllDayScheduleItem(item) {
  return item?.allDay === true || item?.all_day === true || Number(item?.all_day) === 1
    || (!!item?.start?.date && !item?.start?.dateTime);
}

export function allDayItemOccursOn(item, date) {
  if (!isAllDayScheduleItem(item)) return false;
  const start = String(item.startDate || item.start_date || item.start?.date || item.startAt || '').slice(0, 10);
  const end = String(item.endDate || item.end_date || item.end?.date || item.endAt || '').slice(0, 10);
  return !!start && date >= start && (end ? date < end : date === start);
}

const localInstant = value => {
  if (!value) return null;
  const date = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Expand the normal day band to include every timed item on the visible dates.
 * Use the same local clock as grid cells; never let an all-day block force 24 rows.
 */
export function visibleScheduleHours({ dates = [], items = [], startHour = 7, endHour = 22, showAllHours = false } = {}) {
  if (showAllHours) return Array.from({ length: 24 }, (_, hour) => hour);
  let first = startHour;
  let last = endHour;
  for (const date of dates) {
    const dayStart = localInstant(`${date}T00:00:00`);
    const dayEnd = localInstant(`${date}T00:00:00`);
    if (!dayStart || !dayEnd) continue;
    dayEnd.setDate(dayEnd.getDate() + 1);
    for (const item of items) {
      if (isAllDayScheduleItem(item)) continue;
      const start = localInstant(item.startAt || item.start_at || item.start?.dateTime || item.start);
      const end = localInstant(item.endAt || item.end_at || item.end?.dateTime || item.end);
      if (!start || !end || end <= start || end <= dayStart || start >= dayEnd) continue;
      const clippedStart = start < dayStart ? dayStart : start;
      const clippedEnd = end >= dayEnd ? null : end;
      first = Math.min(first, clippedStart.getHours());
      last = Math.max(last, clippedEnd
        ? clippedEnd.getHours() + (clippedEnd.getMinutes() || clippedEnd.getSeconds() || clippedEnd.getMilliseconds() ? 1 : 0)
        : 24);
    }
  }
  first = Math.max(0, Math.min(23, first));
  last = Math.max(first + 1, Math.min(24, last));
  return Array.from({ length: last - first }, (_, index) => first + index);
}
