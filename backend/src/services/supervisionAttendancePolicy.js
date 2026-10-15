import { isStudentIntern } from '../utils/studentIntern.js';
import { normalizeMeetingSettings, parseMeetingSettings } from './meetingSettingsPolicy.js';

// Presenters are mandatory on their assigned date. Classification describes
// the invitation policy; it does not calculate or authorize a payroll payment.
export function supervisionAttendance(session, person = {}) {
  if (session.kind === 'HUDDLE') return null;
  const host = [session.supervisor_user_id, session.co_facilitator_user_id]
    .some(id => Number(id) > 0 && Number(id) === Number(person.id ?? person.user_id));
  const required = host || session.session_type === 'individual' || Boolean(person.isPresenter) || Boolean(Number(person.is_required));
  if (isStudentIntern(person)) return {
    tier: required ? 'mandatory' : 'optional',
    label: `${required ? 'Mandatory' : 'Optional'} · Unpaid internship time`,
    description: 'This supervision is unpaid. Record your attended time as indirect hours toward your master’s internship requirements. ' + (required ? 'RSVP in the app. If you cannot attend, provide a reason there.' : 'RSVP in the app only if you plan to attend. No response or reason is needed if you will not attend.') + ' Email replies do not update attendance.'
  };
  return {
    tier: required ? 'mandatory' : 'optional',
    label: required ? 'Mandatory · Compensated' : 'Optional · Not compensated',
    description: required
      ? 'Your attendance is mandatory and compensated. RSVP in the app so leadership knows whether you can attend. If you cannot attend, a reason is required. Email replies do not update attendance.'
      : 'This session is optional, for your benefit and support. Attendance is not compensated. RSVP only if you plan to attend; no response or reason is needed otherwise.'
  };
}

export function normalizeAttendanceReminders(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
    || !Array.isArray(raw.mandatory) || !Array.isArray(raw.optional)) {
    throw Object.assign(new Error('Choose separate mandatory and optional reminder lists.'), { status: 400 });
  }
  return Object.fromEntries(['mandatory', 'optional', ...(raw.presenter === undefined ? [] : ['presenter'])].map(tier => [
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
