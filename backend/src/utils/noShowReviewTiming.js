import {parseUtcDate} from './officeEventDateTime.util.js';
export function noShowReviewTiming(appointment,now=new Date(),settings={}) {
  const start=parseUtcDate(appointment.startAt),end=parseUtcDate(appointment.endAt);
  if(!start||!end||+end<=+start)throw Object.assign(new Error('Review this appointment’s scheduled start and end before recording attendance.'),{status:409});
  const suggestedWaitMinutes=Number(settings.noShowSuggestedWaitMinutes??15),undoAfterEndMinutes=Number(settings.noShowUndoAfterEndMinutes??10);
  const suggestedAt=new Date(+start+suggestedWaitMinutes*60000),undoUntil=new Date(+end+undoAfterEndMinutes*60000);
  return {suggestedWaitMinutes,undoAfterEndMinutes,started:+now>=+start,earlyConfirmationRequired:+now<+suggestedAt,undoUntil:undoUntil.toISOString(),notifyAt:undoUntil.toISOString(),canUndo:+now<+undoUntil};
}
export function noShowDeclarationNarrative(appointment,timing,comments='') {
  const deadline=new Date(timing.undoUntil).toLocaleString('en-US',{timeZone:appointment.sourceTimezone||'America/Denver',timeZoneName:'short'});
  return `The ${appointment.businessType==='tutoring'?'tutor':'provider'} recorded appointment #${appointment.id} (${appointment.title||'scheduled session'}) as a no-show. This declaration may be undone until ${deadline} if the client arrives. No missed-session fee or package credit has been applied. If it is not undone, the reviewed missed-session policy will be applied after that time and the client will be notified, with a copy to the provider. No service is asserted by this declaration.${String(comments||'').trim()?` Additional comments: ${String(comments).trim()}`:''}`;
}
