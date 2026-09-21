import { parseUtcDate } from '../utils/officeEventDateTime.util.js';

export const escapeMeetingHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function reminderMinutes(value) {
  if (value === null) return null;
  if (value === undefined) return 5;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 10080) {
    throw Object.assign(new Error('Choose a reminder from 1 minute to 7 days before, or no reminder.'), { status: 400 });
  }
  return n;
}
export function invitationKey(event) {
  return `${event.meeting_type || 'team_meeting'}:${event.agency_id}:${event.provider_id}:${event.recurrence_series_id ? `series:${event.recurrence_series_id}` : `event:${event.id}`}`;
}
export function meetingInvitationContent({ events, joinUrl, hostName }) {
  const first = events[0];
  const recurring = !!first.recurrence_series_id;
  const title = first.title || 'Meeting';
  const isInPerson = ['IN_PERSON','IN-PERSON'].includes(String(first.modality || '').toUpperCase()) || (first.platform_video_link != null && Number(first.platform_video_link)===0 && !first.google_meet_link);
  const action = isInPerson ? 'View your meeting' : 'Join your meeting';
  const tz = first.event_timezone || 'America/Denver';
  const dateLabel = e => e.all_day
    ? `${e.start_date instanceof Date ? e.start_date.toISOString().slice(0,10) : String(e.start_date).slice(0, 10)} (all day)`
    : new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: tz }).format(parseUtcDate(e.start_at));
  const frequency = {WEEKLY:'Weekly',BIWEEKLY:'Every 2 weeks',EVERY_3_WEEKS:'Every 3 weeks',EVERY_4_WEEKS:'Every 4 weeks',MONTHLY:'Monthly'}[first.recurrence_frequency] || 'Recurring';
  const heading = `${hostName || 'Your host'} invited you to ${recurring ? 'a recurring meeting' : 'a meeting'}: ${title}`;
  const when = `${recurring ? `${frequency}. First scheduled date: ` : ''}${dateLabel(first)} (${tz}).`;
  const instructions = 'This is your personal invitation. Sign in with your invited account. Your attendance is recorded under your account only when attendance tracking is enabled. The waiting-room rules still apply.';
  const seriesNote = recurring ? 'Use this same personal link for the current or next scheduled occurrence. All dates are in My Schedule; reminders are sent separately for each date when enabled.' : '';
  return {
    subject: `${recurring ? 'Recurring meeting invitation' : 'Meeting invitation'}: ${title}`,
    text: `${heading}\n\n${when}\n${seriesNote}\n\nJoin: ${joinUrl}\n\n${instructions}`,
    html: `<h2>${escapeMeetingHtml(title)}</h2><p>${escapeMeetingHtml(heading)}</p><p>${escapeMeetingHtml(when)}</p><p>${escapeMeetingHtml(seriesNote)}</p><p><a href="${escapeMeetingHtml(joinUrl)}">${action}</a></p><p>${escapeMeetingHtml(instructions)}</p><p>${escapeMeetingHtml(joinUrl)}</p>`
  };
}
