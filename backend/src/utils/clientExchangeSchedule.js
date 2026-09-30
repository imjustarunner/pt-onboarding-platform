export const scheduleDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const schedulePeriods = { morning: 'Morning / AM', afternoon: 'Afternoon', after_school: 'After school', evening: 'Evening', pm: 'PM' };
const invalid = message => Object.assign(new Error(message), { status: 400 });
export function normalizeExchangeSchedule(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid('Scheduling preferences must be an object');
  const days = value.days || [];
  const periods = value.periods || [];
  if (!Array.isArray(days) || days.some(day => !scheduleDays.includes(day))) throw invalid('Select valid days for the client');
  if (!Array.isArray(periods) || periods.some(period => !Object.keys(schedulePeriods).includes(period))) throw invalid('Select valid time preferences');
  const windows = value.windows || [];
  if (!Array.isArray(windows) || windows.length > 14) throw invalid('Use at most 14 day/time options');
  const validTime = time => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(time || ''));
  const normalized = windows.map(window => {
    if (!window || (window.day && !scheduleDays.includes(window.day))) throw invalid('Select a valid day for each time');
    if (!validTime(window.start) || (window.end && !validTime(window.end))) throw invalid('Enter a start time and a valid optional end time');
    if (window.end && window.end <= window.start) throw invalid('End time must be later than start time on the same day');
    return { day: window.day || '', start: window.start, end: window.end || '' };
  });
  const timezone = String(value.timezone || '').trim();
  if (timezone) { try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); } catch { throw invalid('Enter a valid time zone, such as America/Denver'); } }
  if (normalized.length && !timezone) throw invalid('Choose a time zone for specific times');
  const notes = String(value.notes || '').trim();
  if (notes.length > 1000) throw invalid('Scheduling notes must be 1,000 characters or fewer');
  return { days: [...new Set(days)], periods: [...new Set(periods)], windows: normalized, timezone, notes };
}
const clock = time => {
  const [hour, minute] = time.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
};
export function exchangeScheduleLines(schedule) {
  if (!schedule) return [];
  const lines = [];
  if (schedule.days?.length) lines.push(`Days: ${schedule.days.join(', ')}`);
  if (schedule.periods?.length) lines.push(`Preferred times: ${schedule.periods.map(period => schedulePeriods[period] || period).join(', ')}`);
  for (const window of schedule.windows || []) lines.push(`${window.day || (schedule.days?.length ? schedule.days.join(', ') : 'Any day')}: ${clock(window.start)}${window.end ? `–${clock(window.end)}` : ' (specific start time)'}`);
  if (schedule.timezone && lines.length) lines.push(`Time zone: ${schedule.timezone}`);
  if (schedule.notes) lines.push(schedule.notes);
  return lines;
}
export function scheduleFromIntake(preferences = {}, timezone = '') {
  if (preferences.exchangeSchedule) return preferences.exchangeSchedule;
  const rawDays = Array.isArray(preferences.preferredDays) ? preferences.preferredDays : [];
  const days = rawDays.map(day => scheduleDays.find(valid => valid.toLowerCase() === String(day).toLowerCase())).filter(Boolean);
  const rawPeriods = Array.isArray(preferences.preferredTimeOfDay) ? preferences.preferredTimeOfDay : [preferences.preferredTimeOfDay];
  const periods = Object.keys(schedulePeriods).filter(key => rawPeriods.some(raw => String(raw || '').toLowerCase().replace(/ /g, '_').includes(key)));
  return { days, periods, windows: [], timezone: preferences.timezone || timezone || '', notes: '' };
}
