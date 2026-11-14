import { utcMysqlToIso } from '../utils/zonedWallTime.util.js';

export const APP_SESSION_REMINDERS = Object.freeze([
  { id: 'app-72h', channels: ['email'], offsetMinutes: 4320, message: '', askConfirmation: true },
  { id: 'app-24h', channels: ['email', 'sms'], offsetMinutes: 1440, message: '', askConfirmation: true },
  { id: 'app-2h', channels: ['email', 'sms'], offsetMinutes: 120, message: '', askConfirmation: true }
]);
export const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const FINAL_REMINDER_WINDOW_MS = 5 * 60 * 60 * 1000;
const instant = value => value instanceof Date ? +value : +new Date(utcMysqlToIso(value) || value);

export function sessionRsvpState(appointment = {}) {
  let reply = appointment.cancellationRecommendationJson || appointment.cancellation_recommendation_json || {};
  if (typeof reply === 'string') { try { reply = JSON.parse(reply); } catch { reply = {}; } }
  const status = String(appointment.status || '').toLowerCase();
  const response = String(reply?.clientReply || '').toLowerCase();
  if (/cancel|declin/.test(status) || ['cancel', 'cancel_blocked', 'declined', 'no'].includes(response)) return 'declined';
  if (['confirmed', 'client_confirmed'].includes(status) || ['confirm', 'confirmed', 'yes'].includes(response)) return 'confirmed';
  return 'unanswered';
}

export function scheduledReminderSpacing({ startAt, lastSentAt, now = new Date() }) {
  if (!lastSentAt) return { allowed: true };
  const start = instant(startAt), current = instant(now), sent = instant(lastSentAt);
  if (start > current && start - current <= FINAL_REMINDER_WINDOW_MS) return { allowed: true };
  return current - sent >= REMINDER_INTERVAL_MS
    ? { allowed: true }
    : { allowed: false, availableAt: new Date(sent + REMINDER_INTERVAL_MS) };
}

export function sessionReminderMessage({ appointment, when, requiresConfirmation = true, message = '', nearSession = false }) {
  const confirmed = sessionRsvpState(appointment) === 'confirmed';
  const prompt = 'Reply Y to confirm, N to cancel, R to request a reschedule.';
  let body = String(message || '').trim();
  if (confirmed) {
    body = body.replaceAll(prompt, '').trim();
    if (!body || /^Please confirm your appointment/.test(body)) body = `A friendly reminder: your appointment is scheduled for ${when}.`;
    return `${body}${nearSession ? ' We look forward to seeing you soon.' : ' We look forward to seeing you.'}`;
  }
  if (!body) body = `Reminder: ${appointment.title || 'Appointment'} on ${when}.`;
  if (requiresConfirmation && !body.includes(prompt)) body += ` ${prompt}`;
  return body;
}
