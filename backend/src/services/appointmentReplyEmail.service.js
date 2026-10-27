import { utcMysqlToIso } from '../utils/zonedWallTime.util.js';
const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function cancellationProviderEmail(appointment, scheduleUrl) {
  const date = new Date(utcMysqlToIso(appointment.startAt));
  const when = new Intl.DateTimeFormat('en-US', {timeZone: appointment.sourceTimezone || 'America/Denver',
    weekday:'long',month:'long',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(date);
  const summary = `Your appointment on ${when} has been canceled by the client.`;
  const next = 'The cancellation is recorded on your schedule. Sign in to review the client and appointment details.';
  return {subject:'Client canceled an appointment',text:`${summary}\n\n${next}\n\nOpen my schedule: ${scheduleUrl}`,
    html:`<h2>Appointment canceled</h2><p>${escapeHtml(summary)}</p><p>${escapeHtml(next)}</p><p><a href="${escapeHtml(scheduleUrl)}">Open my schedule</a></p>`};
}

export function createAppointmentReplyEmailService(deps) {
  return async function send(notification, context = {}) {
    if (notification?.type !== 'client_appointment_reply' || context.appointmentReply?.intent !== 'cancel'
        || context.appointmentReply?.applied !== true || notification.related_entity_type !== 'appointment') return {skipped:true,reason:'not_applied_cancellation'};
    const appointment = await deps.appointment(notification.related_entity_id);
    if (!appointment || Number(appointment.agencyId)!==Number(notification.agency_id)
        || Number(appointment.providerUserId)!==Number(notification.user_id) || appointment.status!=='canceled_by_client') return {skipped:true,reason:'appointment_scope_mismatch'};
    const user = await deps.user(notification.user_id);
    const workEmail = String(user?.work_email || user?.email || '').trim();
    if (!workEmail || !await deps.activeMember(user.id,appointment.agencyId)) return {skipped:true,reason:'inactive_recipient'};
    // Required operational notice to the work account. Optional personal-email
    // preferences do not suppress it, and personal_email is never a fallback.
    // No optional notification trigger: the shared sender still enforces the
    // organization/platform transport gates and records the delivery receipt.
    const url = await deps.scheduleUrl(appointment.agencyId);
    return deps.send({agencyId:appointment.agencyId,userId:user.id,to:workEmail,triggerKey:null,
      templateType:'client_appointment_reply',source:'auto',...cancellationProviderEmail(appointment,url)});
  };
}

export async function sendAppointmentReplyEmail(notification, context) {
  if (notification?.type !== 'client_appointment_reply' || context?.appointmentReply?.intent !== 'cancel' || context?.appointmentReply?.applied !== true) return {skipped:true,reason:'not_applied_cancellation'};
  const [{default:Appointment},{default:User},{default:Agency},{default:pool},
    {sendScheduleNotificationEmail},{buildPublicAppUrl}] = await Promise.all([
    import('../models/Appointment.model.js'),import('../models/User.model.js'),import('../models/Agency.model.js'),
    import('../config/database.js'),import('./scheduleNotificationEmail.service.js'),import('../utils/publicPortalUrl.js')]);
  return createAppointmentReplyEmailService({appointment:id=>Appointment.findById(id),user:id=>User.findById(id),
    activeMember:async(userId,agencyId)=>(await pool.execute('SELECT 1 FROM user_agencies WHERE user_id=? AND agency_id=? AND is_active=1 LIMIT 1',[userId,agencyId]))[0].length===1,
    send:sendScheduleNotificationEmail,
    scheduleUrl:async id=>buildPublicAppUrl(await Agency.findById(id),'dashboard?tab=my_schedule')})(notification,context);
}
