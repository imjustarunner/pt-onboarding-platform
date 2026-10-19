import { isStudentIntern } from '../utils/studentIntern.js';
import { isBachelorsCredentialText } from '../utils/credentialNormalization.js';
export const TRAINING_SCHEDULER_ROLES = new Set(['admin', 'super_admin', 'superadmin', 'clinical_practice_assistant', 'provider_plus']);
export const canScheduleTraining = user => TRAINING_SCHEDULER_ROLES.has(String(user?.role || '').toLowerCase());
export const isScheduledTraining = event => event?.kind === 'TEAM_MEETING' && event?.meeting_subtype === 'training';
export function trainingRequirement(user) {
  return isStudentIntern(user) || isBachelorsCredentialText(user?.credential) ? 'mandatory' : 'optional';
}
export function trainingAttendancePolicy(user, required) {
  if (!required) return { credit: 'attendance', payable: false };
  return isStudentIntern(user) ? { credit: 'indirect', payable: false } : { credit: 'support_activity', payable: true };
}
export function validateTrainingInput(input) {
  const title = String(input.title || '').trim();
  const topic = String(input.topic || '').trim();
  const timeZone = String(input.timeZone || 'America/Denver');
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!title || title.length > 200 || topic.length > 4000) fail('Enter a training title (up to 200 characters) and topic (up to 4,000).');
  try { new Intl.DateTimeFormat('en', { timeZone }); } catch { fail('Choose a valid time zone.'); }
  if (!Number.isSafeInteger(Number(input.proctorId)) || Number(input.proctorId) < 1) fail('Select a proctor / trainer.');
  if (!Array.isArray(input.sessions) || !input.sessions.length || input.sessions.length > 60) fail('Choose between 1 and 60 training dates.');
  const sessions = input.sessions.map(s => {
    // Explicit offsets keep multi-day events correct across DST boundaries.
    if (!s || ![s.startAt, s.endAt].every(v => typeof v === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(v))) fail('Training dates must include a time zone offset.');
    const start = new Date(s.startAt), end = new Date(s.endAt);
    if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start || end - start > 86400000) fail('Each training day needs a start and end time within 24 hours. Add another date for multi-day training.');
    return { startAt: start.toISOString().slice(0,19).replace('T',' '), endAt: end.toISOString().slice(0,19).replace('T',' ') };
  }).sort((a,b) => a.startAt.localeCompare(b.startAt));
  if (sessions.some((s,i) => i && s.startAt < sessions[i-1].endAt)) fail('Training dates must not overlap.');
  for (const key of ['agencyVisible','videoDefaultOn','videoAllowed','muteAll']) if (input[key] !== undefined && typeof input[key] !== 'boolean') fail(`${key} must be true or false.`);
  return { title, topic, timeZone, sessions };
}
