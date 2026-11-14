const reasonLabel = reason => ({
  rsvp_declined:'The client declined this session.', canceled_appt:'This session is canceled or no longer scheduled.',
  recipient_opted_out:'The recipient opted out of this channel.', no_consent:'Recorded text consent is missing or was withdrawn.',
  no_portal_recipient:'No active linked portal account is available for this reminder.',
  organization_channel_disabled:'This reminder channel is disabled by the organization.',
  no_from_number:'No registered text sending number is configured.', no_recipient:'No permitted email recipient is available.',
  within_24_hours_of_previous_reminder:'Another reminder was sent in the last 24 hours. The final five-hour exception did not apply.',
  schedule_update_pending:'An appointment update is queued, so this reminder was not sent.',
  guardian_access_removed:'The recipient no longer has access to this session.',
  service_ended:'This service has ended.', school_morning_already_sent:'The school-session notice was already sent today.',
  reminder_policy_updated:'Replaced by the updated reminder schedule.', reminder_schedule_needs_review:'The reminder schedule needs staff review before sending.',
  session_already_started:'This session has already started.',session_ended:'This session has already ended.'
})[reason] || (reason ? String(reason).replaceAll('_',' ') : null);
/** Delivery rows remain the source of truth when no successful-send log exists. */
export function sessionCommunicationTimeline(reminders = [], communications = []) {
  const remindersById = new Map(reminders.map(row => [Number(row.id), row]));
  const deliveries = reminders.map(row => {
    const log = communications.find(item => Number(item.reminderId) === Number(row.id) && item.direction === 'outbound');
    const metadata = { ...(log?.metadata || {}), deliveryStatus: row.status, scheduledFor: row.scheduledFor,
      sentAt: row.sentAt || null, reason: row.errorMessage || reasonLabel(row.skipReason) };
    return { id: `reminder-${row.id}`, reminderId: row.id, category: 'notifications', direction: 'outbound',
      channel: String(row.kind || '').includes(':in_app') ? 'in_app' : row.channel,
      kind: row.ruleKey === 'manual_extra' ? 'Manual reminder' : 'Scheduled reminder',
      bodyPreview: log?.metadata?.bodyRendered ? row.messageBody || log.bodyPreview : log?.bodyPreview || row.messageBody || '', metadata,
      createdAt: row.sentAt || row.createdAt || row.scheduledFor };
  });
  const activity = communications.filter(row => !(row.direction === 'outbound' && remindersById.has(Number(row.reminderId))))
    .filter(row => !(row.kind === 'additional_reminder' && row.metadata?.deliveryStatus === 'queued' && reminders.length))
    .map(row => ({ ...row, id: `communication-${row.id}`, category: row.direction === 'inbound' ? 'replies' : 'notifications' }));
  return [...deliveries, ...activity];
}
