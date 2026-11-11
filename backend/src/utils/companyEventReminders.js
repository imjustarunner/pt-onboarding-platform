const json = value => {
  if (typeof value !== 'string') return value && typeof value === 'object' ? value : {};
  try { return JSON.parse(value) || {}; } catch { return {}; }
};
const hours = (value, fallback) => [...new Set((Array.isArray(value) ? value : fallback)
  .map(Number).filter(n => Number.isFinite(n) && n > 0 && n <= 24 * 365))].sort((a, b) => b - a).slice(0, 12);
const channels = (value = {}, fallback = {}) => ({
  inApp: value.inApp === undefined ? fallback.inApp !== false : value.inApp === true,
  email: value.email === undefined ? fallback.email === true : value.email === true,
  sms: value.sms === undefined ? fallback.sms === true : value.sms === true
});

/** Existing polls retain their offset/channel behavior; RSVP is a separate schedule. */
export function normalizeCompanyEventReminderConfig(raw = {}) {
  const value = json(raw), rsvp = json(value.rsvp);
  return {
    enabled: value.enabled === true,
    offsetsHours: hours(value.offsetsHours, [168, 24]),
    channels: channels(value.channels),
    anchor: value.anchor === 'poll_close' ? 'poll_close' : 'event_start',
    rsvp: {
      enabled: rsvp.enabled === true,
      intervalHours: Math.min(24 * 30, Math.max(12, Number(rsvp.intervalHours) || 48)),
      channels: channels(rsvp.channels, { inApp: true, email: true })
    }
  };
}

export const invitationResponse = invite => {
  const direct = String(invite.response || '').trim().toLowerCase();
  if (['yes', 'no', 'maybe'].includes(direct)) return direct;
  const key = String(invite.response_key || '').trim().toUpperCase();
  return ['Y', 'YES'].includes(key) ? 'yes' : ['N', 'NO'].includes(key) ? 'no' : ['M', 'MAYBE'].includes(key) ? 'maybe' : null;
};

export function dueCompanyEventReminders(event, invite, now = new Date(), occurrence = null) {
  const config = normalizeCompanyEventReminderConfig(event.reminderConfig || event.reminder_config_json);
  const instant = Number(new Date(now)), response = invitationResponse(invite), result = [];
  const startRaw = occurrence?.startsAt || event.startsAt || event.starts_at;
  const start = startRaw ? Number(new Date(startRaw)) : NaN;
  const deadlineRaw = event.rsvpDeadline || event.rsvp_deadline || startRaw;
  const deadline = deadlineRaw ? Number(new Date(deadlineRaw)) : NaN;
  const sentRaw = invite.created_at || invite.createdAt;
  const invitedAt = sentRaw ? Number(new Date(sentRaw)) : NaN;
  if (!response && config.rsvp.enabled && Number.isFinite(invitedAt) && instant >= invitedAt && (!Number.isFinite(deadline) || instant < deadline)) {
    const interval = config.rsvp.intervalHours * 3600000;
    const slot = Math.floor((instant - invitedAt) / interval);
    if (slot >= 1) result.push({ kind: 'rsvp_reminder', key: `rsvp:${slot}`, channels: config.rsvp.channels });
  }
  // No attendance reminders for an event whose date has not been chosen.
  if (config.enabled && ['yes', 'maybe'].includes(response) && Number.isFinite(start) && instant < start) {
    for (const offset of config.offsetsHours) {
      const due = start - offset * 3600000;
      // Do not catch up old notices or deliver both seven-day and one-day messages together.
      if (instant >= due && instant - due < Math.min(12, offset) * 3600000 && (!Number.isFinite(invitedAt) || invitedAt <= due)) {
        result.push({ kind: 'attendance_reminder', key: `attend:${new Date(start).toISOString()}:${offset}`, channels: config.channels, offsetHours: offset });
      }
    }
  }
  return result;
}
