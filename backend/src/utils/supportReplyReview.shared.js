import crypto from 'node:crypto';

export const PILOT_DEFAULTS = Object.freeze({ timeZone: 'America/Denver', sendTime: '18:00', weekdaysOnly: true });
export const REVIEW_DELIVERY_STATUSES = new Set(['sent', 'queued', 'failed', 'sending', 'skipped', 'unknown']);
export const reviewError = (message, status = 400, code = 'support_review_invalid') => Object.assign(new Error(message), { status, code });
export const hashReviewKey = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

export function validDate(value) {
  const text = String(value || '');
  const parsed = new Date(`${text}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) throw reviewError('A valid YYYY-MM-DD date is required');
  return text;
}

export function localParts(now, timeZone = PILOT_DEFAULTS.timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(now)).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, ...parts };
}

export function shiftDate(date, days) {
  const d = new Date(`${validDate(date)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export const isWeekday = (date) => ![0, 6].includes(new Date(`${validDate(date)}T12:00:00Z`).getUTCDay());

// Resolve by actual zone offsets on either side of a transition. An overlap uses
// the first occurrence; a nonexistent wall time advances to the first real minute.
export function localDateTimeToUtc(date, time, timeZone) {
  validDate(date);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw reviewError('sendTime must be HH:mm');
  const target = Date.parse(`${date}T${time}:00Z`);
  const offsets = new Set();
  for (const hours of [-36, -12, 0, 12, 36]) {
    const instant = target + hours * 3600000;
    const p = localParts(instant, timeZone);
    const wall = Date.parse(`${p.date}T${p.time}:${p.second}Z`);
    offsets.add(wall - instant);
  }
  const matches = [...offsets].map((offset) => target - offset).filter((instant) => {
    const p = localParts(instant, timeZone);
    return p.date === date && p.time === time;
  }).sort((a, b) => a - b);
  if (matches.length) return new Date(matches[0]);
  // Rare configurable cutoff in the spring-forward gap; never omit a digest.
  const candidate = Math.min(...[...offsets].map((offset) => target - offset));
  for (let n = 0; n <= 180; n += 1) {
    const instant = candidate + n * 60000;
    const p = localParts(instant, timeZone);
    if (p.date === date && p.time >= time) return new Date(instant);
  }
  throw reviewError('Unable to resolve local digest time');
}

export function reviewWindow(date, config = {}) {
  const timeZone = config.timeZone || PILOT_DEFAULTS.timeZone;
  const sendTime = config.sendTime || PILOT_DEFAULTS.sendTime;
  const weekdaysOnly = config.weekdaysOnly !== false;
  let previousDate = shiftDate(date, -1);
  if (weekdaysOnly) while (!isWeekday(previousDate)) previousDate = shiftDate(previousDate, -1);
  return { date: validDate(date), start: localDateTimeToUtc(previousDate, sendTime, timeZone).toISOString(), end: localDateTimeToUtc(date, sendTime, timeZone).toISOString(), timeZone };
}

export function latestDueReviewDate(now, config = {}) {
  const timeZone = config.timeZone || PILOT_DEFAULTS.timeZone;
  let date = localParts(now, timeZone).date;
  if (new Date(now) < localDateTimeToUtc(date, config.sendTime || PILOT_DEFAULTS.sendTime, timeZone)) date = shiftDate(date, -1);
  if (config.weekdaysOnly !== false) while (!isWeekday(date)) date = shiftDate(date, -1);
  return date;
}

export function normalizePilotConfig(input) {
  const agencyId = Number(input.agencyId || input.agency_id);
  const reviewerUserId = Number(input.reviewerUserId || input.reviewer_user_id);
  let ids = input.pilotUserIds ?? input.pilot_user_ids_json ?? [];
  if (typeof ids === 'string') ids = JSON.parse(ids);
  const pilotUserIds = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))];
  const timeZone = String(input.timeZone || input.time_zone || PILOT_DEFAULTS.timeZone);
  const sendTime = String(input.sendTime || input.send_time || PILOT_DEFAULTS.sendTime);
  if (!Number.isSafeInteger(agencyId) || agencyId < 1 || !Number.isSafeInteger(reviewerUserId) || reviewerUserId < 1 || !pilotUserIds.length || pilotUserIds.length > 30) throw reviewError('Agency, reviewer, and 1–30 pilot staff are required');
  try { localDateTimeToUtc('2026-01-15', sendTime, timeZone); } catch { throw reviewError('Invalid timezone or send time'); }
  return { agencyId, reviewerUserId, pilotUserIds, timeZone, sendTime, weekdaysOnly: ![false, 0].includes(input.weekdaysOnly ?? input.weekdays_only), enabled: ![false, 0].includes(input.enabled ?? input.is_enabled), createdAt: input.created_at || input.createdAt || null };
}

export function assertReviewAccess({ user, agencyId, memberAgencyIds, config, write = false }) {
  if (!user?.id) throw reviewError('Authentication required', 401);
  const isSuper = user.role === 'super_admin';
  const isAdmin = ['admin', 'super_admin'].includes(user.role);
  if (!isSuper && !(memberAgencyIds || []).map(Number).includes(Number(agencyId))) throw reviewError('Access denied to this agency', 403);
  if (write ? !isAdmin : !(isAdmin || Number(config?.reviewerUserId) === Number(user.id))) throw reviewError('Only the configured reviewer or an agency administrator can access this review', 403);
}

export function deliveryState(input) {
  const status = String(input.deliveryStatus || input.status || 'unknown').toLowerCase();
  if (!REVIEW_DELIVERY_STATUSES.has(status)) throw reviewError('Unsupported delivery status');
  if (status === 'sent' && !input.transportMessageId && !input.verifiedCommunicationSent) throw reviewError('Sent status requires verified transport evidence', 409, 'support_review_delivery_unverified');
  return status;
}

export function buildReviewNotice({ date, url, totals = {}, incomplete = false }) {
  const count = (key) => Number.isSafeInteger(totals[key]) && totals[key] >= 0 ? totals[key] : 'Unavailable';
  const summary = [
    `Conversations reviewed: ${count('tickets')}`,
    `Drafts captured: ${count('drafts')}`,
    `Confirmed sent replies: ${count('sent')}`,
    `Replies without a captured draft: ${count('missingDraft')}`
  ].join('\n');
  return { subject: 'Your support email review is ready', text: `Your support email review for ${date} is ready.\n\n${summary}${incomplete ? '\nThese counts are incomplete because the review reached its display limit.' : ''}\n\nSign in to compare received messages, generated drafts, and recorded delivery results:\n${url}\n\nThe review identifies missing drafts and replies without verified delivery evidence.` };
}
