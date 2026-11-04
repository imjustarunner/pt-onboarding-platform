import { wallMysqlToUtcMysql } from '../utils/zonedWallTime.util.js';

// Shared by booked appointments and pre-EHR school schedule notices.
export const DAY_ABSENCE_EXPLANATION = 'This session is displaying due to SCHOOL soft schedule. It does not currently reflect an EHR session. You may cancel your day and your clients/guardians will be notified by email. Use urgent Cancel day for weather, sickness, or unexpected absences.';

export function absenceDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(date))
    ? new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)) : String(date || '');
}
// Soft slots are local school times. Only show saved times; never invent a
// midnight session for an assigned weekday, or include a slot outside a timed absence.
export function schoolAbsenceWhen({ date, slots = [], timeZone, windowStart, windowEnd }) {
  const clock = value => {
    const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(String(value || ''));
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
    const hour = Number(match[1]);
    return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`;
  };
  const utcMillis = value => {
    const text = String(value).replace(' ', 'T');
    return Date.parse(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(text) ? text : `${text}Z`);
  };
  const selected = slots.filter(slot => {
    if (!clock(slot.startTime) || !clock(slot.endTime)) return false;
    if (!windowStart || !windowEnd || !timeZone) return true;
    return utcMillis(wallMysqlToUtcMysql(`${date} ${slot.startTime}`, timeZone)) < utcMillis(windowEnd)
      && utcMillis(wallMysqlToUtcMysql(`${date} ${slot.endTime}`, timeZone)) > utcMillis(windowStart);
  }).sort((a, b) => a.startTime.localeCompare(b.startTime));
  if (!selected.length) return absenceDate(date);
  const ranges = [...new Set(selected.map(slot => `${clock(slot.startTime)}–${clock(slot.endTime)}`))];
  let zone = '';
  if (timeZone) {
    const instant = new Date(utcMillis(wallMysqlToUtcMysql(`${date} ${selected[0].startTime}`, timeZone)));
    zone = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(instant).find(p => p.type === 'timeZoneName')?.value || timeZone;
  }
  return `${absenceDate(date)} at ${ranges.join(' and ')}${zone ? ` (${zone})` : ''}`;
}
export function absenceCause(reasonCategory, reason = '') {
  return ({ weather: 'due to weather conditions', illness: 'because I am unwell', emergency: 'due to an unexpected emergency', facility: 'because the location is closed', provider_unavailable: 'due to an unexpected absence' })[reasonCategory]
    || (/weather/i.test(reason) ? 'due to weather conditions' : 'due to an unexpected absence');
}
export function dayAbsenceMessage({ urgent = true, providerName = 'Your provider', providerAuthored = true, schoolName, clientName, date, when, reason, reasonCategory }) {
  if (!urgent) return {
    subject: 'Your care team has canceled an upcoming session',
    text: `Hello,\n\nYour care team has canceled an upcoming session${clientName ? ` for ${clientName}` : ''}${when || date ? ` on ${when || absenceDate(date)}` : ''}. Please log in to your client portal to see any upcoming changes to your schedule.`
  };
  const cause = absenceCause(reasonCategory, reason);
  const appointment = `${clientName ? `the session for ${clientName}` : 'our session'} on ${when || absenceDate(date)}${schoolName ? ` at ${schoolName}` : ''}`;
  return {
    subject: `Session canceled — ${date || when}`,
    text: providerAuthored
      ? `Hello,\n\nUnfortunately, ${cause}, I need to cancel ${appointment}. I apologize for the change and appreciate your understanding.\n\n${providerName}`
      : `Hello,\n\n${providerName} has let us know they are unable to attend on ${when || absenceDate(date)}${cause === 'because I am unwell' ? ' due to illness' : ` ${cause}`}. We have canceled ${clientName ? `the session for ${clientName}` : 'the scheduled session'}${schoolName ? ` at ${schoolName}` : ''}. We apologize for the change and appreciate your understanding.\n\nYour care team`
  };
}

export function schoolDayAbsenceMessage({ providerName = 'Your assigned provider', providerAuthored, schoolName, date, reasonCategory, reason, wholeDay = true }) {
  const cause = absenceCause(reasonCategory, reason), day = absenceDate(date);
  return { subject: `${providerName} — schedule change for ${day}`,
    text: providerAuthored
      ? `Hello, ${schoolName} team,\n\nUnfortunately, ${cause}, I need to cancel ${wholeDay ? 'my sessions' : 'the selected sessions'} at your school on ${day}. I apologize for the change and appreciate your understanding.\n\nI am notifying my clients and their families of my absence. Any contacts who cannot be reached will be flagged for follow-up.\n\n${providerName}`
      : `Hello, ${schoolName} team,\n\nWe apologize for the change. ${providerName} has let us know they will not be able to attend on ${day}${cause === 'because I am unwell' ? ' due to illness' : ` ${cause}`}. ${wholeDay ? 'Their sessions' : 'The selected sessions'} at your school have been canceled.\n\nWe are contacting their clients and families to inform them of the absence. If you have any questions, please do not hesitate to reply to this email.\n\nSchools Team` };
}
