/**
 * Shared text helpers for Email App Assistant.
 */

export function normalizeText(raw) {
  return String(raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripQuotedReply(body) {
  const lines = String(body || '').split(/\r?\n/);
  const kept = [];
  for (const line of lines) {
    if (/^>+/.test(line.trim())) break;
    if (/^On .+ wrote:$/i.test(line.trim())) break;
    if (/^From:\s+/i.test(line.trim()) && kept.length > 0) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(line.trim())) break;
    kept.push(line);
  }
  return kept.join('\n').trim();
}

export function combineSubjectBody(subject, body) {
  const s = normalizeText(subject).replace(/^re:\s*/i, '');
  const b = normalizeText(stripQuotedReply(body));
  if (s && b) return `${s}\n${b}`;
  return s || b || '';
}

export function localDateParts(date = new Date(), timeZone = 'America/Denver') {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
    return {
      ymd: `${parts.year}-${parts.month}-${parts.day}`,
      weekday: parts.weekday,
      hour: Number(parts.hour),
      minute: Number(parts.minute),
      timeZone
    };
  } catch {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return {
      ymd: `${y}-${m}-${d}`,
      weekday: weekdays[date.getDay()],
      hour: date.getHours(),
      minute: date.getMinutes(),
      timeZone: 'UTC'
    };
  }
}

export function parseHourMinute(token) {
  const t = String(token || '').trim().toLowerCase();
  const m = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const meridiem = (m[3] || '').toLowerCase();
  if (!Number.isFinite(hour) || hour < 0 || hour > 23 || min < 0 || min > 59) return null;
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (!meridiem && hour <= 7) hour += 12;
  return { hour, min };
}

export function extractClockTime(text) {
  const s = String(text || '');
  const m = s.match(/\bat\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i)
    || s.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i);
  if (!m) return null;
  return parseHourMinute(m[1]);
}

export function formatClock({ hour, min }, timeZone = 'America/Denver') {
  const d = new Date();
  d.setHours(hour, min || 0, 0, 0);
  try {
    return d.toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' });
  } catch {
    const h12 = hour % 12 || 12;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    return `${h12}:${String(min || 0).padStart(2, '0')} ${ampm}`;
  }
}

export function parseFeatureFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

export function isFeatureEnabled(agency) {
  const flags = parseFeatureFlags(agency?.feature_flags);
  return flags.emailAppAssistantEnabled === true || flags.emailAppAssistantEnabled === 'true' || flags.emailAppAssistantEnabled === 1;
}

export const PRIVILEGED_ROLES = new Set(['admin', 'super_admin', 'support']);

export function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

export function isPrivilegedRole(role) {
  return PRIVILEGED_ROLES.has(normalizeRole(role));
}
