import {appointmentServiceLabel,isLearningAppointment} from './appointmentPresentation.js';
import {parseUtcDate} from './officeEventDateTime.util.js';
export function noShowReviewTiming(appointment,now=new Date(),settings={}) {
  const start=parseUtcDate(appointment.startAt),end=parseUtcDate(appointment.endAt);
  if(!start||!end||+end<=+start)throw Object.assign(new Error('Review this appointment’s scheduled start and end before recording attendance.'),{status:409});
  const suggestedWaitMinutes=Number(settings.noShowSuggestedWaitMinutes??15),undoAfterEndMinutes=Number(settings.noShowUndoAfterEndMinutes??10);
  const suggestedAt=new Date(+start+suggestedWaitMinutes*60000),undoUntil=new Date(+end+undoAfterEndMinutes*60000);
  return {suggestedWaitMinutes,undoAfterEndMinutes,started:+now>=+start,earlyConfirmationRequired:+now<+suggestedAt,undoUntil:undoUntil.toISOString(),notifyAt:undoUntil.toISOString(),canUndo:+now<+undoUntil};
}
export function noShowDeclarationNarrative(appointment, timing, details = {}) {
  const title=isLearningAppointment(appointment)?appointmentServiceLabel(appointment):appointment.title||'scheduled session';
  const deadline=new Date(timing.undoUntil).toLocaleString('en-US',{timeZone:appointment.sourceTimezone||'America/Denver',timeZoneName:'short'});
  const reason = details.reason;
  const outreach = details.outreach;
  const message = String(details.clientFacingReason || '').trim();
  const comments = String(details.additionalComments || '').trim();
  const documentation = [
    reason ? `Reason documented: ${reason}.` : details.reasonKnown === false ? 'The reason for the missed appointment was unknown.' : '',
    outreach?.length ? `Outreach documented: ${outreach.join(', ')}.` : '',
    message ? `Message included in the client notice: ${message}` : '',
    comments ? `Internal comments: ${comments}` : ''
  ].filter(Boolean);
  const outcome = timing.canUndo === false
    ? `The correction window closed at ${deadline}. The reviewed missed-session policy takes effect now and the client notice is queued.`
    : `This declaration may be undone until ${deadline} if the client arrives. Any reviewed consequence and the client notice follow that deadline.`;
  return [
    `The ${appointment.businessType === 'tutoring' ? 'tutor' : 'provider'} recorded appointment #${appointment.id} (${title}) as a no-show.`,
    outcome, ...documentation, 'No service is asserted by this declaration.'
  ].join(' ');
}
