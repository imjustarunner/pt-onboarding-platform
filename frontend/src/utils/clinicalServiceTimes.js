const clockMinutes = value => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''))
  ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : null;
const durationMinutes = value => value !== '' && value != null && Number.isInteger(Number(value)) && Number(value) > 0 && Number(value) <= 1440 ? Number(value) : null;
const clock = minutes => minutes >= 0 && minutes < 1440
  ? `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}` : '';

// Work only on an unsigned editor copy. Never wrap onto another service date.
export function synchronizeServiceTimes(context, changedField = null, { anchorDuration = false } = {}) {
  const next = { ...context };
  const start = clockMinutes(next.startTime), end = clockMinutes(next.endTime), duration = durationMinutes(next.durationMinutes);
  if (changedField === 'durationMinutes') {
    if (duration == null) return next;
    if (start != null) next.endTime = clock(start + duration);
    else if (end != null) next.startTime = clock(end - duration);
  } else if (changedField === 'startTime' || changedField === 'endTime') {
    if (clockMinutes(next[changedField]) == null) return next;
    if (duration != null && (anchorDuration || start == null || end == null)) {
      if (changedField === 'startTime') next.endTime = clock(start + duration);
      else next.startTime = clock(end - duration);
    } else if (start != null && end != null) next.durationMinutes = end > start ? end - start : '';
  } else {
    // Fill missing draft values without changing conflicting saved values.
    if (duration == null && start != null && end != null && end > start) next.durationMinutes = end - start;
    else if (!next.endTime && start != null && duration != null) next.endTime = clock(start + duration);
    else if (!next.startTime && end != null && duration != null) next.startTime = clock(end - duration);
  }
  return next;
}

export function serviceTimeFeedback(context) {
  const start = clockMinutes(context.startTime), end = clockMinutes(context.endTime), duration = durationMinutes(context.durationMinutes);
  if (start != null && end != null) {
    if (end <= start) return 'End time must be after start time on the same service date.';
    if (duration != null && end - start !== duration) return 'Duration must match the start and end times.';
  }
  if (duration != null && ((start != null && !context.endTime && start + duration >= 1440) || (end != null && !context.startTime && end - duration < 0))) return 'These times cross midnight. Enter start and end times on the same service date.';
  return '';
}
