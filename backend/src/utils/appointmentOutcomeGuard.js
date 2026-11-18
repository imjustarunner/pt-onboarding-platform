import {parseUtcDate} from './officeEventDateTime.util.js';
const terminal = new Set(['completed','no_show','voided','rescheduled','canceled','cancelled','late_canceled',
  'canceled_by_client','canceled_by_guardian','canceled_by_provider','canceled_by_organization']);
export function assertNoShowUsesSignedWorkflow(existing,requestedStatus,{trustedFinalization=false}={}) {
  const next=String(requestedStatus||'').toLowerCase(),current=String(existing?.status||'').toLowerCase();
  if(next==='no_show_pending'&&current!==next || next==='no_show'&&current!==next&&!(trustedFinalization&&current==='no_show_pending')) {
    throw Object.assign(new Error('Open Appointment Change → No-show to review and sign the declaration. Its correction window and delayed notice must be preserved.'),{status:409,code:'NO_SHOW_WORKFLOW_REQUIRED'});
  }
}
export function appointmentScheduleChanged(existing,patch){
 const fields=['startAt','endAt','providerUserId','modality','serviceLocationId','roomId','serviceCode','tenantServiceId','participants','recurrenceRule'];
 return fields.some(key=>{if(patch[key]===undefined)return false;if(['startAt','endAt'].includes(key)){const a=parseUtcDate(existing?.[key]),b=parseUtcDate(patch[key]);return !a||!b||+a!==+b;}if(['providerUserId','serviceLocationId','roomId','tenantServiceId'].includes(key))return Number(patch[key]||0)!==Number(existing?.[key]||0);return JSON.stringify(patch[key])!==JSON.stringify(existing?.[key]);});
}
export function assertAppointmentOutcomePreserved(existing, patch) {
  const status = String(existing?.status || '').toLowerCase();
  if ((terminal.has(status)||status==='no_show_pending') && appointmentScheduleChanged(existing,patch)) {
    throw Object.assign(new Error('This session already has a final outcome. Its time, service, participants and location are read-only. Use Reschedule for an eligible missed session, or book a new session.'), {status:409,code:'APPOINTMENT_SCHEDULE_LOCKED'});
  }
  if (terminal.has(status) && patch.status != null && String(patch.status).toLowerCase() !== status) {
    throw Object.assign(new Error('This appointment already has a final outcome. Refresh the schedule; an ordinary edit cannot replace its cancellation, no-show or signed attendance decision.'),
      {status:409,code:'APPOINTMENT_OUTCOME_CHANGED'});
  }
}
