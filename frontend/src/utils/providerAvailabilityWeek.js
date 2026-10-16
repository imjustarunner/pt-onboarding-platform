export function availabilityDate(value, timeZone = 'America/Denver') {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(value));
}

export function addAvailabilityDays(date, count) {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + count);
  return next.toISOString().slice(0, 10);
}

export function availabilityMonday(date) {
  return addAvailabilityDays(date, -(new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7);
}

export function hasWeekendOpenings(slots, timeZone) {
  return (slots || []).some(slot => {
    if (!Number.isFinite(Date.parse(slot.startAt))) return false;
    return [0, 6].includes(new Date(`${availabilityDate(slot.startAt, timeZone)}T12:00:00Z`).getUTCDay());
  });
}

// Merge the same published time across care settings, keeping each choice intact.
export function providerAvailabilityWeek({ weekStart, slots = [], timeZone = 'America/Denver', now = Date.now(), weekends = false }) {
  const today = availabilityDate(now, timeZone);
  const days = Array.from({ length:weekends ? 7 : 5 }, (_, index) => {
    const date = addAvailabilityDays(weekStart, index);
    return { date, past:date < today, today:date === today, openings:[] };
  });
  const dates = new Map(days.map(day => [day.date, day]));
  for (const slot of [...slots].sort((a,b) => Date.parse(a.startAt) - Date.parse(b.startAt))) {
    const start = Date.parse(slot.startAt), end = Date.parse(slot.endAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start <= now || !['VIRTUAL','IN_PERSON'].includes(slot.format)) continue;
    const day = dates.get(availabilityDate(start, timeZone));
    if (!day) continue;
    const key = [start, end, slot.frequency || 'WEEKLY', slot.purpose || ''].join(':');
    let opening = day.openings.find(item => item.key === key);
    if (!opening) { opening = { key, startAt:slot.startAt, endAt:slot.endAt, choices:[] }; day.openings.push(opening); }
    if (!opening.choices.some(choice => choice.format === slot.format && (choice.buildingId || null) === (slot.buildingId || null))) opening.choices.push(slot);
    opening.choices.sort((a,b) => (a.format === 'VIRTUAL' ? 0 : 1) - (b.format === 'VIRTUAL' ? 0 : 1));
  }
  return days;
}
