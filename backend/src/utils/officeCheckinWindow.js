import { parseUtcDate } from './officeEventDateTime.util.js';

// Check-in closes at 30 minutes after the start, or the session end if earlier.
export function checkinClosesAt(event) {
  const start = parseUtcDate(event.start_at)?.getTime();
  const end = parseUtcDate(event.end_at)?.getTime();
  const closes = Math.min(start + 30 * 60_000, end);
  return Number.isFinite(closes) ? new Date(closes).toISOString() : null;
}
export function canCheckIn(event, now = Date.now()) {
  const closes = checkinClosesAt(event);
  return !!closes && new Date(closes).getTime() > Number(now);
}
