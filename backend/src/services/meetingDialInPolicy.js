import crypto from 'node:crypto';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';

export const DIAL_IN_PIN_LENGTH = 4;
// Inbound Voice legs use compact IDs; outbound legs may use canonical UUIDs.
export const isDialInCallId = value => /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(String(value || ''));
export const dialInError = (message, status = 409) => Object.assign(new Error(message), { status });
// A generic office Voice application is deliberately insufficient. Telephone
// meetings need their own number/application and signed callback configuration.
export function dialInReadiness(env = process.env) {
  const missing = [];
  if (!/^\+[1-9]\d{7,14}$/.test(env.MEETING_DIAL_IN_NUMBER || '')) missing.push('dedicated phone number');
  let origin;
  try {
    const url = new URL(env.MEETING_DIAL_IN_PUBLIC_ORIGIN || '');
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname
      || !['', '/'].includes(url.pathname) || url.search || url.hash) throw new Error('origin');
    origin = url.origin;
  } catch { missing.push('HTTPS callback origin'); }
  if ((env.MEETING_DIAL_IN_PIN_SECRET || '').length < 32) missing.push('personal PIN lookup secret');
  if (!env.VONAGE_VOICE_SIGNATURE_SECRET) missing.push('signed Voice callback secret');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(env.MEETING_DIAL_IN_VOICE_APPLICATION_ID || '')) missing.push('dedicated Voice application');
  if (!(env.MEETING_DIAL_IN_VOICE_PRIVATE_KEY || env.MEETING_DIAL_IN_VOICE_PRIVATE_KEY_PATH)) missing.push('dedicated Voice private key');
  if (!env.VONAGE_API_KEY || !env.VONAGE_API_SECRET) missing.push('carrier account credentials');
  const enabled = env.MEETING_DIAL_IN_ENABLED === 'true';
  return { enabled, configured: enabled && !missing.length, assetsConfigured: !missing.length,
    reason: !missing.length ? (enabled ? '' : 'Telephone joining is disabled.')
      : 'Telephone joining needs dedicated Voice configuration.', missing, origin };
}
export const dialInConfigured = (env = process.env) => dialInReadiness(env).configured;
export const dialInAssetsConfigured = (env = process.env) => dialInReadiness(env).assetsConfigured;
export function requireDialInConfiguration({ allowDisabled = false } = {}) {
  if (!(allowDisabled ? dialInAssetsConfigured() : dialInConfigured())) throw dialInError('Telephone joining is not configured or enabled.', 503);
}
export function pinDigest(pin, secret = process.env.MEETING_DIAL_IN_PIN_SECRET) {
  if (!secret || secret.length < 32) throw dialInError('Telephone joining is not configured.', 503);
  return crypto.createHmac('sha256', secret).update(String(pin)).digest('hex');
}
export function newPersonalPin(length = DIAL_IN_PIN_LENGTH) {
  return Array.from({ length }, () => crypto.randomInt(0, 10)).join('');
}
export function registeredDialInPhone(user = {}) {
  return [user.personal_phone, user.work_phone, user.phone_number].map(normalizeSmsPhone).find(Boolean) || null;
}
export function dialInCallerHash(phone) {
  return pinDigest(`caller:${normalizeSmsPhone(phone) || 'private'}`);
}
export function personalPinDigest(pin, callerHash) {
  // Four digits are never a shared-number credential on their own. Bind them to
  // the registered calling number. Accounts without a phone retain a long PIN.
  return pinDigest(String(pin).length === 4 ? `personal:${callerHash}:${pin}` : pin);
}
export function occurrenceKey(type, row, callerHash = null) {
  // Rescheduling, moving tenants or changing the facilitator invalidates issued PINs.
  return crypto.createHash('sha256').update(JSON.stringify([type, Number(row.id), Number(row.agency_id),
    Number(row.supervisor_user_id || row.provider_id), parseUtcDate(row.start_at)?.toISOString(),
    parseUtcDate(row.end_at)?.toISOString(), row.modality || '', row.platform_video_link ?? null,
    ...(callerHash ? [callerHash] : [])])).digest('hex');
}
export function assertDialInMeeting(type, row, { joining = false, now = new Date() } = {}) {
  if (!row || !['supervision', 'team-meeting'].includes(type)) throw dialInError('Meeting not found.', 404);
  const pilotHosts = String(process.env.MEETING_DIAL_IN_PILOT_SUPERVISOR_IDS || '').split(',').filter(Boolean).map(Number);
  if (pilotHosts.length && (type !== 'supervision' || !pilotHosts.includes(Number(row.supervisor_user_id))))
    throw dialInError('Telephone joining is not enabled for this meeting yet.');
  if (type === 'team-meeting' && !['TEAM_MEETING', 'HUDDLE'].includes(row.kind)) throw dialInError('Telephone joining is unavailable for this meeting.');
  if (row.live_ended_at || row.meeting_completed_at || ['CANCELLED', 'RESCHEDULED', 'MISSED', 'FINALIZED', 'COMPLETED', 'ENDED', 'MANUAL_PENDING', 'MANUAL_RECORDING'].includes(String(row.status).toUpperCase()))
    throw dialInError('This meeting has ended or is no longer available.', 410);
  if (['IN_PERSON', 'IN-PERSON'].includes(String(row.modality).toUpperCase())
    || (type === 'team-meeting' && row.platform_video_link != null && !Number(row.platform_video_link)))
    throw dialInError('Telephone joining requires a platform video meeting.');
  const start = parseUtcDate(row.start_at), end = parseUtcDate(row.end_at);
  if (!start || !end) throw dialInError('This meeting needs a scheduled time.');
  // Bound unused credentials even if a browser never closes the meeting.
  if (now.getTime() > Math.max(end.getTime(), start.getTime() + 8 * 3600000)) throw dialInError('Telephone access has expired.', 410);
  if (joining && now.getTime() < start.getTime() - 15 * 60000) throw dialInError('Telephone joining opens fifteen minutes before the meeting.');
}
export function dialInDetails(pin, row, name, number = process.env.MEETING_DIAL_IN_NUMBER, { callingPhone = null, isHost = false } = {}) {
  const start = parseUtcDate(row.start_at);
  const title = row.title || (row.supervisor_user_id ? 'Supervision' : 'Meeting');
  let when = start?.toISOString() || '';
  try { when = new Intl.DateTimeFormat('en-US', { dateStyle:'medium',timeStyle:'short',timeZone:row.event_timezone || 'America/Denver' }).format(start) + ` (${row.event_timezone || 'America/Denver'})`; } catch { /* ISO fallback */ }
  const sequence = `${number},,${pin}#${isHost ? ',,,1' : ''}`;
  const callingPhoneHint = callingPhone ? `Call from your registered phone ending ${callingPhone.slice(-4)} with caller ID enabled.` : '';
  const hostHint = isHost ? 'Your one-tap link also admits invited callers while you are connected.' : '';
  return { number, pin, name, title, when, startAt: start?.toISOString(), callingPhoneHint, hostHint,
    // A basic number link works everywhere. The full sequence is a convenience;
    // clients must still display the PIN for dialers that ignore pauses/DTMF.
    telephoneUrl: `tel:${number}`, oneTapUrl: `tel:${sequence.replace('#', '%23')}`,
    text: `${title}\n${when}\nOne-tap dial for ${name}: ${sequence}\nJoin by phone: ${number}\nPersonal PIN: ${pin} #\n${[callingPhoneHint, hostHint].filter(Boolean).join(' ')}\nUse only your own invitation. If automatic PIN entry is unavailable, enter ${pin} followed by #${isHost ? ', then press 1' : ''}. Joining opens 15 minutes before the meeting.` };
}
export function unionAttendanceIntervals(intervals, { start = 0, end = Date.now() } = {}) {
  const sorted = intervals.map(([a, b]) => [Math.max(Number(a), start), Math.min(Number(b), end)])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const interval of sorted) {
    const last = merged.at(-1);
    if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
    else merged.push([...interval]);
  }
  return { intervals: merged, seconds: Math.floor(merged.reduce((n, [a, b]) => n + b - a, 0) / 1000) };
}
