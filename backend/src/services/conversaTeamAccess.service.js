/** Team broadcast/poll management is separate from ordinary event scheduling. */
export const CONVERSA_TEAM_ACCESS_MESSAGE = 'Only superadmins, admins, and support can manage Conversa team texts and polls.';
export function canManageConversaTeam(user) {
  return ['super_admin', 'admin', 'support'].includes(String(user?.role || '').trim().toLowerCase());
}
function config(value) {
  if (typeof value === 'string') { try { return JSON.parse(value) || {}; } catch { return {}; } }
  return value && typeof value === 'object' ? value : {};
}
export function isConversaTeamCommunication(event = {}) {
  const type = String(event.eventType ?? event.event_type ?? '').trim().toLowerCase();
  const vote = config(event.votingConfig ?? event.voting_config_json);
  const reminder = config(event.reminderConfig ?? event.reminder_config_json);
  const sms = config(event.smsDraft ?? event.sms_draft_json);
  return ['direct_notice', 'team_poll'].includes(type) || !!vote.enabled
    || !!reminder.channels?.sms || !!sms.message || !!sms.scheduledFor;
}
export function assertConversaTeamManager(user, ...events) {
  if (canManageConversaTeam(user)) return;
  if (events.length && !events.some(isConversaTeamCommunication)) return;
  const error = new Error(CONVERSA_TEAM_ACCESS_MESSAGE);
  error.status = 403;
  error.statusCode = 403;
  throw error;
}
