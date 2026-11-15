import { batchAppointmentNoticeKind } from '../utils/appointmentNoticeKind.js';
import { FAMILY_APPOINTMENT_LOGIN, familyCancellationAttribution } from './appointmentCancellationCopy.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { appointmentTimeLabel } from './cancellationFollowUp.service.js';

export const escapeNoticeHtml = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const futureAppointment = (appointment, now = new Date()) => parseUtcDate(appointment?.startAt)?.getTime() > +now;

// A quiet window absorbs corrections; imminent appointments must not wait 15 minutes.
export function scheduleNoticeDeadline({ now, startAt, firstQueuedAt = now, bufferMinutes = 15 }) {
  const start = +parseUtcDate(startAt);
  return new Date(Math.max(+now, Math.min(+now + Math.max(1, Math.min(15, Number(bufferMinutes) || 15)) * 60000,
    +firstQueuedAt + 30 * 60000, start - 60 * 60000)));
}

export function buildScheduleNoticeMessage(entries, portalUrl, { recipientUserId = null } = {}) {
  const linkedReplacements = new Set(entries.map(e => Number(e.cancellation?.replacementAppointmentId)).filter(Boolean));
  const visibleEntries = entries.filter(e => !linkedReplacements.has(Number(e.appointment.id)));
  const sections = visibleEntries.map(({ appointment: a, payload, cancellation }) => {
    if (cancellation?.replacementAppointmentId) return cancellation;
    if (cancellation) {
      if(payload.facts?.guardianSummary && payload.facts?.guardianCancellationOperationId) {
        if(Number(recipientUserId)>0 && Number(recipientUserId)===Number(payload.facts.cancellationActorUserId)){
          if(!payload.facts.guardianSummary.endsService)return cancellation;
          const feedbackUrl=new URL(portalUrl);
          feedbackUrl.searchParams.set('serviceExit',payload.facts.guardianCancellationOperationId);
          return {...cancellation,text:`${cancellation.text}\n\nHelp us improve (optional): ${feedbackUrl.href}\nSign in to leave a short rating or suggestion. Feedback is optional and does not restart services or notifications.`,
            html:`${cancellation.html}<p><a href="${escapeNoticeHtml(feedbackUrl.href)}">Help us improve (optional)</a></p><p>Sign in to leave a short rating or suggestion. Feedback is optional and does not restart services or notifications.</p>`};
        }
        const summary=payload.facts.guardianSummary;
        const text=`${summary.count?`${summary.count} future appointment${summary.count===1?' has':'s have'} been canceled.`:'No future appointments remained to cancel.'}${summary.endsService?` The ${summary.serviceLabel||'selected'} service with this provider has ended.${summary.teamNotified?' Our team has been notified.':''}${summary.notificationsDisabled?' Future email and text notifications for this service have been disabled.':''}`:''} Other services are unchanged. ${FAMILY_APPOINTMENT_LOGIN}`;
        return {...cancellation,text,html:`<p>${escapeNoticeHtml(text)}</p>`,sms:text};
      }
      if (payload.facts?.absenceSource) return { ...cancellation, text:cancellation.bodyText || cancellation.text, html:cancellation.bodyHtml || cancellation.html };
      if (cancellation.noShow) return { ...cancellation, sms: `Please review the missed appointment notice in your secure portal. ${FAMILY_APPOINTMENT_LOGIN}` };
      const attribution = familyCancellationAttribution(a,payload.facts,recipientUserId);
      // The other parent's private explanation is not copied into shared texts/email.
      const text = attribution.familyInitiated
        ? `${attribution.text} ${cancellation.followUpText || ''} ${cancellation.feeText || ''} ${FAMILY_APPOINTMENT_LOGIN}`
        : `${attribution.text}\n\n${cancellation.text}\n\n${FAMILY_APPOINTMENT_LOGIN}`;
      return { ...cancellation, text, html: `<p>${escapeNoticeHtml(text).replaceAll('\n','<br>')}</p>`,
        sms: `${attribution.text} ${FAMILY_APPOINTMENT_LOGIN}` };
    }
    const zone = a.sourceTimezone || 'America/Denver';
    const when = `${appointmentTimeLabel(a.startAt, zone)} (${zone})`;
    const moved = payload.eventType === 'moved' && !payload.initialBooking;
    const replacement = !!payload.facts?.replacementForAppointmentId;
    const updated = payload.eventType === 'updated' && !payload.initialBooking;
    const recurring = !replacement && !moved && !!payload.facts?.recurringBooking;
    let text = replacement
      ? `Your time has been reserved for ${when}. It replaces the canceled appointment on ${appointmentTimeLabel(payload.facts.replacementOriginalStartAt || payload.originalStartAt, zone)} (${zone}).`
      : moved
      ? `Your appointment has moved to ${when}. The previous time, ${appointmentTimeLabel(payload.originalStartAt, zone)} (${zone}), is no longer scheduled. Please use the updated time in your portal.`
      : updated ? `Your appointment details have been updated. Your appointment is scheduled for ${when}. Please review the current details in your portal.`
      : recurring ? `Your recurring schedule is saved. Your next appointment is scheduled for ${when}. View all scheduled dates in your portal.`
      : `Your appointment is scheduled for ${when}. Please review the current appointment details in your portal.`;
    if (replacement) {
      const minutes = (parseUtcDate(a.endAt)-parseUtcDate(a.startAt))/60000;
      if (Number.isFinite(minutes) && minutes>0) text += ` Duration: ${minutes} minutes.`;
      if (a.attendanceDetails) text += ` ${a.attendanceDetails}`;
      text += ' Your provider will reach out if there are any changes to their schedule. Your other appointments remain scheduled.';
    }
    return { text, html: `<p>${escapeNoticeHtml(text)}</p>`, subject: replacement ? 'Your replacement appointment is reserved' : moved ? 'Your appointment has moved' : updated ? 'Your appointment details have been updated' : recurring ? 'Your next recurring appointment is scheduled' : 'Your appointment is scheduled' };
  });
  const linkedSections = sections.map((section, index) => {
    if (sections.length < 2) return section;
    const entry = visibleEntries[index], url = entry.portalUrl || portalUrl;
    const label = `Review appointment on ${appointmentTimeLabel(entry.appointment.startAt, entry.appointment.sourceTimezone || 'America/Denver')}`;
    return { ...section, text: `${section.text}\n${label}: ${url}`,
      html: `${section.html}<p><a href="${escapeNoticeHtml(url)}">${escapeNoticeHtml(label)}</a></p>` };
  });
  const footer = entries.every(e => e.payload.facts?.absenceSource) ? '' : 'Please reply to this email to reach our support team. Use the secure portal for appointment details.';
  return {
    subject: sections.length === 1 ? sections[0].subject : batchAppointmentNoticeKind(entries) === 'appointment_scheduled' ? 'Your appointments are scheduled' : 'Your appointment schedule has been updated',
    text: `${linkedSections.map(s => s.text).join('\n\n')}\n\nReview your current schedule: ${portalUrl}\n\n${footer}`,
    html: `${linkedSections.map(s => s.html).join('<hr>')}<p><a href="${escapeNoticeHtml(portalUrl)}">${sections.length === 1 ? 'Review my appointment' : 'Review my latest appointment'}</a></p>${footer ? `<p>${footer}</p>` : ''}`,
    sms: sections.length === 1 && batchAppointmentNoticeKind(entries) === 'appointment_scheduled'
      ? `Your ${visibleEntries[0].payload.facts?.recurringBooking ? 'next recurring ' : ''}appointment is scheduled. Review the details in your secure portal: ${portalUrl}`
      : batchAppointmentNoticeKind(entries) === 'appointment_scheduled' ? `Your appointments are scheduled. Review the details in your secure portal: ${portalUrl}`
      : sections.every(section => section.sms) ? sections.map(section => section.sms).join('\n') : `Your appointment schedule has been updated. Please review the latest details in your secure portal: ${portalUrl}`
  };
}
