/** Compute before peer privacy removes session identifiers. Manual reservations remain valid. */
export function officeBookingNeedsSession(slot) {
 if (!slot || slot.state !== 'assigned_booked') return false;
 return !(Number(slot.clinicalSessionId)>0 || Number(slot.learningSessionId)>0 || slot.learningLinked===true);
}
