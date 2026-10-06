import { describe, it, expect } from 'vitest';
import { duePresenterReminders, PRESENTER_REMINDER_MINUTES } from '../supervisionPresenterReminderPolicy.js';
describe('presenter reminder deadlines', () => {
  const start = new Date('2026-11-02T16:30:00Z');
  const session = { start_at: start };
  it('defaults to a week, 48h, 24h, 3h and 1h', () => {
    expect(PRESENTER_REMINDER_MINUTES).toEqual([10080, 2880, 1440, 180, 60]);
  });
  it.each(PRESENTER_REMINDER_MINUTES)('sends the %i-minute deadline only when due', offset => {
    const deadline = start.getTime() - offset * 60000;
    expect(duePresenterReminders(session, new Date(deadline - 1))).toEqual([]);
    expect(duePresenterReminders(session, new Date(deadline + 60000))).toEqual([offset]);
    expect(duePresenterReminders(session, new Date(deadline + 180001))).toEqual([]);
  });
  it('does not replay missed reminders or send after start', () => {
    expect(duePresenterReminders(session, start)).toEqual([]);
    expect(duePresenterReminders(session, new Date(start.getTime() - 30 * 60000))).toEqual([]);
  });
});
