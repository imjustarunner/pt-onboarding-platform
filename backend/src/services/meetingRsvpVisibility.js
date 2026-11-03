// Call only after authorizing access to the event. An agency role does not grant
// access to a meeting in another organization by itself.
export function canViewDeclinedMeetingParticipants(event, actor, people = []) {
  const userId = Number(actor?.id || 0);
  if (!userId) return false;
  const person = people.find(p => Number(p.id ?? p.userId ?? p.user_id) === userId);
  return ['admin', 'super_admin', 'superadmin', 'support'].includes(String(actor?.role || '').toLowerCase())
    || [event.provider_id, event.supervisor_user_id, event.co_facilitator_user_id].some(id => Number(id) > 0 && Number(id) === userId)
    || Number(person?.is_cohost) === 1;
}

export function visibleMeetingRsvpParticipants(people, canSeeDeclined, viewerId = null) {
  return people.filter(person => canSeeDeclined
    || (viewerId && Number(person.id ?? person.userId ?? person.user_id) === Number(viewerId))
    || !['DECLINED', 'WITHDRAWN'].includes(String(person.status || person.rsvp || '').toUpperCase()))
    .map(person => {
      if (canSeeDeclined || (viewerId && Number(person.id ?? person.userId ?? person.user_id) === Number(viewerId))) return person;
      const { declineReason, decline_reason, rsvp_decline_reason, ...visible } = person;
      return visible;
    });
}
