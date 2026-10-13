/** Format display values only; retain recorded seconds for payroll calculations. */
export function formatClaimTime(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  return Number.isFinite(n) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n) : '—';
}
const AUTO_SOURCES = new Set(['meeting_compensation_auto', 'supervision_session_finalize', 'supervision_payroll_correction', 'session_finalize', 'provider_update', 'onboarding_portal', 'schedule_event_training_flag']);
export function automaticClaimLabel(claim) {
  const p = claim?.payload || {};
  if (p.manualMeetingLogId) return null;
  return AUTO_SOURCES.has(p.source) ? 'System — automatic' : null;
}
export function hasMeetingClaimDetails(claim) {
  const p = claim?.payload || {};
  return !!(p.supervisionSessionId || (p.scheduleEventId && ['meeting_compensation_auto','schedule_event_training_flag'].includes(p.source)));
}
