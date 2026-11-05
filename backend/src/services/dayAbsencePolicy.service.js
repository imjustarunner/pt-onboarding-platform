import { wallMysqlToUtcMysql } from '../utils/zonedWallTime.util.js';
import { composeAbsenceLetter } from './dayAbsenceNarrative.service.js';

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
export function dayAbsenceMessage({ urgent = true, providerName = 'Your provider', providerAuthored = true, schoolName, clientName, date, when, reason, reasonCategory, note, audience }) {
  if (!urgent) return {
    subject: 'Your care team has canceled an upcoming session',
    text: `Hello,\n\nYour care team has canceled an upcoming session${clientName ? ` for ${clientName}` : ''}${when || date ? ` on ${when || absenceDate(date)}` : ''}. Please log in to your client portal to see any upcoming changes to your schedule.`
  };
  return composeAbsenceLetter({
    audience: audience || (clientName ? 'guardian' : 'client'), providerAuthored, providerName, clientName, schoolName,
    when: when || absenceDate(date), reasonCategory, reason, note
  });
}

export function schoolDayAbsenceMessage({ providerName = 'Your assigned provider', providerAuthored, schoolName, date, reasonCategory, reason, note, wholeDay = true }) {
  if (reasonCategory === 'planned_out') {
    const when = absenceDate(date);
    const school = schoolName || 'school';
    const text = providerAuthored
      ? `Hello, ${school} team,\n\nI will be away on ${when} and have canceled my school sessions for that time. This is a planned absence.\n\n${providerName}`
      : `Hello, ${school} team,\n\n${providerName} will be away on ${when}. Their school sessions for that time have been canceled. This is a planned absence.\n\nSchools Team`;
    return { subject: `Provider absence for ${when}`, text };
  }
  return composeAbsenceLetter({ audience: 'school', providerAuthored, providerName, schoolName, when: absenceDate(date), reasonCategory, reason, note, wholeDay });
}
