export const HUDDLE_SUBTYPES = ['cpa', 'mentorship'];
export function huddleSubtype(event, hostRole = '') {
  return HUDDLE_SUBTYPES.includes(event?.meeting_subtype) ? event.meeting_subtype : hostRole === 'clinical_practice_assistant' ? 'cpa' : 'mentorship';
}
export function huddleTitle(event, hostRole = '') {
  return huddleSubtype(event, hostRole) === 'cpa' ? 'CPA Meeting' : 'Mentorship Meeting';
}
export function huddleHostServiceCode(event, hostRole = '') {
  return huddleSubtype(event, hostRole) === 'cpa' ? 'Admin Time' : 'Individual Meeting';
}
export function isUnpaidMeetingClaim(claim) {
  return claim?.payload?.source === 'meeting_compensation_auto' && claim.payload.unpaidIndirect === true;
}
