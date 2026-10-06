import { parseUtcDate } from '../utils/officeEventDateTime.util.js';

export const PRESENTER_REMINDER_MINUTES = Object.freeze([10080, 2880, 1440, 180, 60]);

export function duePresenterReminders(session, now = new Date()) {
  const start = parseUtcDate(session.start_at)?.getTime();
  if (!Number.isFinite(start) || start <= now.getTime()) return [];
  // The existing scheduler runs each minute. Do not flood newly assigned
  // presenters with reminders for all the deadlines that already passed.
  return PRESENTER_REMINDER_MINUTES.filter(minutes => {
    const elapsed = now.getTime() - (start - minutes * 60000);
    return elapsed >= 0 && elapsed <= 180000;
  });
}
