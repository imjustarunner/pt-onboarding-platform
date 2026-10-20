import { isSupervisionPayEligibleHours, normalizeSupervisionStartDateYmd } from '../utils/supervisionHoursGate.util.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
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
  const prelicensed = Number(person.supervision_is_prelicensed) === 1
    || /\b(LPCC|LMFTC|MFTC|LSW|SWC|LPC-A)\b/i.test(String(person.credential || ''));
  const belowThreshold = !host && prelicensed && !isSupervisionPayEligibleHours({
    individualHours: person.supervision_individual_hours, groupHours: person.supervision_group_hours
  });
  const startDate = normalizeSupervisionStartDateYmd(person.supervision_start_date);
  const sessionDate = parseUtcDate(session.start_at);
  const beforeEffectiveDate = !host && prelicensed && (!startDate || (sessionDate &&
    new Intl.DateTimeFormat('en-CA',{timeZone:session.event_timezone || 'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(sessionDate) < startDate));
  const compensationFlag = person.is_compensable_snapshot ?? person.supervision_is_compensable;
  const compensated = required && !belowThreshold && !beforeEffectiveDate
    && (host || Number(compensationFlag) === 1);
  const unpaid = !required || belowThreshold || beforeEffectiveDate || (!host && compensationFlag != null && Number(compensationFlag) === 0);
  const payDescription = belowThreshold
    ? 'This supervision is not compensated under your current eligibility. Compensation requires at least 50 individual supervision hours and 100 total supervision hours.'
    : compensated ? 'This supervision is compensated according to your approved eligibility and rate.'
      : unpaid ? 'This supervision is not compensated under your current eligibility.'
        : 'Required attendance does not by itself establish compensation. Compensation follows your approved eligibility.';
  return {
    tier: required ? 'mandatory' : 'optional',
    label: `${required ? 'Mandatory' : 'Optional'}${compensated ? ' · Compensated' : unpaid ? ' · Not compensated' : ''}`,
    description: `${required ? 'Your attendance is mandatory.' : 'This session is optional, for your benefit and support.'} ${payDescription} ` + (required
      ? 'RSVP in the app so leadership knows whether you can attend. If you cannot attend, a reason is required. Email replies do not update attendance.'
      : 'RSVP only if you plan to attend; no response or reason is needed otherwise.')
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
  if (pendingOptionalSupervision(session,person)) {
    // Respect an explicit reminder opt-out. Otherwise stop prompting an
    // unanswered optional invitation after its final three-day reminder.
    const optedOut = Array.isArray(reminders) ? reminders.length === 0
      : Array.isArray(settings.reminders) ? settings.reminders.length === 0 : session.reminder_minutes === null;
    return {...session,meeting_settings_json:{...settings,reminders:optedOut ? [] : [10080,4320]}};
  }
  return Array.isArray(reminders)
    ? { ...session, meeting_settings_json: { ...settings, reminders } }
    : session;
}

export function pendingOptionalSupervision(session, person = {}) {
  return session.kind !== 'HUDDLE' && session.session_type === 'group' && session.enrollment_mode !== 'signup_only'
    && supervisionAttendance(session,person)?.tier === 'optional'
    && !['SIGNED_UP','JOINED','LEFT','DECLINED','WITHDRAWN','REMOVED','CANCELLED'].includes(String(person.status || '').toUpperCase());
}
