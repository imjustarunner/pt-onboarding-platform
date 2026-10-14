import { meetingReminderSchedule } from './meetingReminderPolicy.js';
import { parseMeetingSettings } from './meetingSettingsPolicy.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';

export const PRESENTER_REMINDER_MINUTES = Object.freeze([10080, 2880, 1440, 180, 60]);

export function duePresenterReminders(session, now = new Date()) {
  const start = parseUtcDate(session.start_at)?.getTime();
  if (!Number.isFinite(start) || start <= now.getTime()) return [];
  // The existing scheduler runs each minute. Do not flood newly assigned
  // presenters with reminders for all the deadlines that already passed.
  const settings = parseMeetingSettings(session.meeting_settings_json);
  const reminders = settings.attendanceReminders?.presenter ?? PRESENTER_REMINDER_MINUTES;
  return meetingReminderSchedule({ ...session, meeting_settings_json: { reminders } })
    .filter(reminder => now.getTime() - reminder.at.getTime() >= 0 && now.getTime() - reminder.at.getTime() <= 180000)
    .map(reminder => /^\d+$/.test(reminder.key) ? Number(reminder.key) : reminder.key);
}
