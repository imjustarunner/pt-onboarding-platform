const terminal = new Set(['completed','no_show','voided','rescheduled','canceled','cancelled','late_canceled',
  'canceled_by_client','canceled_by_guardian','canceled_by_provider','canceled_by_organization']);
export function assertAppointmentOutcomePreserved(existing, patch) {
  const status = String(existing?.status || '').toLowerCase();
  if (terminal.has(status) && patch.status != null && String(patch.status).toLowerCase() !== status) {
    throw Object.assign(new Error('This appointment already has a final outcome. Refresh the schedule; an ordinary edit cannot replace its cancellation, no-show or signed attendance decision.'),
      {status:409,code:'APPOINTMENT_OUTCOME_CHANGED'});
  }
}
