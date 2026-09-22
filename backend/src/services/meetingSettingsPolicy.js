export const MEETING_TYPES = {
  general: 'General team meeting', huddle: 'Huddle', admin: 'Admin Meeting', town_hall: 'Town Hall',
  interview: 'Interview', evaluation: 'Employee Evaluation',
  leadership_circle: 'Leadership Circle', supervisors_meeting: 'Supervisors meeting'
};
export const ADMIN_ONLY_MEETING_TYPES = new Set(['leadership_circle', 'supervisors_meeting']);
export function defaultMeetingSettings(type = 'general') {
  return { agenda: type !== 'interview', goals: type !== 'interview', actionItems: type !== 'interview',
    attendance: true, transcription: true, screenShare: true,
    compensation: ['huddle','admin','town_hall','evaluation','leadership_circle','supervisors_meeting'].includes(type),
    reminders: ['business_days_3', 1440, 5] };
}
export function parseMeetingSettings(raw) {
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return {}; } }
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}
export function normalizeMeetingSettings(raw, defaults = defaultMeetingSettings()) {
  const input = parseMeetingSettings(raw);
  const result = { ...defaults };
  for (const key of ['agenda','goals','actionItems','attendance','transcription','screenShare','compensation']) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== 'boolean') throw Object.assign(new Error(`Invalid meeting setting: ${key}`), { status: 400 });
      result[key] = input[key];
    }
  }
  if (input.reminders !== undefined) {
    if (!Array.isArray(input.reminders) || input.reminders.length > 10 || input.reminders.some(v => v !== 'business_days_3' && (!Number.isInteger(v) || v < 1 || v > 10080))) {
      throw Object.assign(new Error('Choose up to 10 reminders, between one minute and seven days before.'), { status: 400 });
    }
    result.reminders = [...new Set(input.reminders)];
  }
  return result;
}
