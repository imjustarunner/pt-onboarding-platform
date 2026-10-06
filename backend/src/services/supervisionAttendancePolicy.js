import { normalizeMeetingSettings, parseMeetingSettings } from './meetingSettingsPolicy.js';

// Attendance classification is independent of presentation duties. It describes
// the invitation policy; it does not calculate or authorize a payroll payment.
export function supervisionAttendance(session, person = {}) {
  if (session.kind === 'HUDDLE' || session.session_type !== 'group') return null;
  const host = [session.supervisor_user_id, session.co_facilitator_user_id]
    .some(id => Number(id) > 0 && Number(id) === Number(person.id ?? person.user_id));
  const required = person.is_required == null ? host : Boolean(Number(person.is_required));
  return {
    tier: required ? 'mandatory' : 'optional',
    label: required ? 'Mandatory · Compensated' : 'Optional · Not compensated',
    description: required
      ? 'Your attendance is mandatory and compensated. Please RSVP so leadership knows whether you can attend.'
      : 'This session is optional, for your benefit and support. Attendance is not compensated. You are welcome to attend if it fits your schedule.'
  };
}

export function normalizeAttendanceReminders(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
    || !Array.isArray(raw.mandatory) || !Array.isArray(raw.optional)) {
    throw Object.assign(new Error('Choose separate mandatory and optional reminder lists.'), { status: 400 });
  }
  return Object.fromEntries(['mandatory', 'optional'].map(tier => [
    tier, normalizeMeetingSettings({ reminders: raw[tier] }).reminders
  ]));
}

export function supervisionReminderEvent(session, person) {
  const settings = parseMeetingSettings(session.meeting_settings_json);
  const attendance = supervisionAttendance(session, person);
  const reminders = attendance && settings.attendanceReminders?.[attendance.tier];
  return Array.isArray(reminders)
    ? { ...session, meeting_settings_json: { ...settings, reminders } }
    : session;
}
