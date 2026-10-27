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
  const sections = entries.filter(e => !linkedReplacements.has(Number(e.appointment.id))).map(({ appointment: a, payload, cancellation }) => {
    if (cancellation?.replacementAppointmentId) return cancellation;
    if (cancellation) {
      const attribution = familyCancellationAttribution(a,payload.facts,recipientUserId);
      // The other parent's private explanation is not copied into shared texts/email.
      const text = attribution.familyInitiated
        ? `${attribution.text} ${cancellation.followUpText || ''} ${FAMILY_APPOINTMENT_LOGIN}`
        : `${attribution.text}\n\n${cancellation.text}\n\n${FAMILY_APPOINTMENT_LOGIN}`;
      return { ...cancellation, text, html: `<p>${escapeNoticeHtml(text).replaceAll('\n','<br>')}</p>`,
        sms: `${attribution.text} ${FAMILY_APPOINTMENT_LOGIN}` };
    }
    const zone = a.sourceTimezone || 'America/Denver';
    const when = `${appointmentTimeLabel(a.startAt, zone)} (${zone})`;
    const moved = payload.eventType === 'moved' && !payload.initialBooking;
    const replacement = !!payload.facts?.replacementForAppointmentId;
    let text = replacement
      ? `Your time has been reserved for ${when}. It replaces the canceled appointment on ${appointmentTimeLabel(payload.facts.replacementOriginalStartAt || payload.originalStartAt, zone)} (${zone}).`
      : moved
      ? `Your appointment has moved to ${when}. The previous time, ${appointmentTimeLabel(payload.originalStartAt, zone)} (${zone}), is no longer scheduled. Please use the updated time in your portal.`
      : `Your appointment is scheduled for ${when}. Please review the current appointment details in your portal.`;
    if (replacement) {
      const minutes = (parseUtcDate(a.endAt)-parseUtcDate(a.startAt))/60000;
      if (Number.isFinite(minutes) && minutes>0) text += ` Duration: ${minutes} minutes.`;
      if (a.attendanceDetails) text += ` ${a.attendanceDetails}`;
      text += ' Your provider will reach out if there are any changes to their schedule. Your other appointments remain scheduled.';
    }
    return { text, html: `<p>${escapeNoticeHtml(text)}</p>`, subject: replacement ? 'Your replacement appointment is reserved' : moved ? 'Your appointment has moved' : 'Your appointment is scheduled' };
  });
  const footer = 'Please reply to this email to reach our support team. Use the secure portal for clinical details.';
  return {
    subject: sections.length === 1 ? sections[0].subject : 'Your appointment schedule has been updated',
    text: `${sections.map(s => s.text).join('\n\n')}\n\nReview your current schedule: ${portalUrl}\n\n${footer}`,
    html: `${sections.map(s => s.html).join('<hr>')}<p><a href="${escapeNoticeHtml(portalUrl)}">Review my appointments</a></p><p>${footer}</p>`,
    sms: sections.every(section => section.sms) ? sections.map(section => section.sms).join('\n') : `Your appointment schedule has been updated. Please review the latest details in your secure portal: ${portalUrl}`
  };
}
