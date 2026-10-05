export const fail = (status, message) => Object.assign(new Error(message), { status, recordsSafe: true });
export function text(value, label, max = 2000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw fail(400, `${label} is required (maximum ${max} characters).`);
  return value.trim();
}
export const finished = status => ['closed', 'fulfilled'].includes(status);
export function managerIds(input) {
  const ids = input.managerIds;
  if (!Array.isArray(ids) || ids.length > 10 || ids.some(id => !Number.isSafeInteger(id) || id < 1) || new Set(ids).size !== ids.length) throw fail(400, 'Choose a primary and distinct backups.');
  if (input.enabled === true && !ids.length) throw fail(400, 'Choose a primary Records Manager before enabling requests.');
  if (!Number.isInteger(input.followUpDays) || input.followUpDays < 1 || input.followUpDays > 30) throw fail(400, 'Choose an internal follow-up target from 1 to 30 days.');
  return ids;
}
export function requestFields(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw fail(400, "Request details are required.");
  if (input.attested !== true) throw fail(400, 'Confirm that you are requesting your own records or are authorized to act for the patient.');
  if (!['self', 'parent', 'guardian', 'representative'].includes(input.relationship)) throw fail(400, 'Select your relationship to the patient.');
  const email = text(input.email, 'Email', 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, 'Enter a valid email address.');
  return {
    requesterName: text(input.requesterName, 'Your name', 200),
    patientName: text(input.patientName, 'Patient name', 200),
    email, phone: text(input.phone, 'Phone', 50), relationship: input.relationship,
    scope: text(input.scope, 'Requested records and dates', 2000),
    attestedAt: new Date().toISOString(),
  };
}
const transitions = {
  pending_verification: ['pending_review', 'closed'],
  pending_review: ['approved', 'closed'], approved: ['fulfilled', 'closed'],
};
export function transitionRequest(prior, input, actorId) {
  if (!transitions[prior.status]?.includes(input.status)) throw fail(409, 'This status change is not available. Refresh the request.');
  const next = { ...prior, status: input.status };
  if (input.status === 'pending_review') {
    if (!['on_file_callback', 'in_person'].includes(input.identityMethod) || input.identityConfirmed !== true)
      throw fail(400, 'Verify identity in person or using contact information independently retrieved from the existing chart.');
    next.identityMethod = input.identityMethod;
    next.identityVerifiedBy = actorId;
    next.identityVerifiedAt = new Date().toISOString();
  }
  if (input.status === 'approved') {
    if (!prior.identityMethod || input.authorityConfirmed !== true) throw fail(400, 'Review identity and legal authority before approving.');
    next.authorityReviewedBy = actorId;
    next.authorityReviewedAt = new Date().toISOString();
  }
  if (input.status === 'fulfilled') next.deliveryReference = text(input.deliveryReference, 'Secure delivery reference', 500);
  next.response = text(input.response, 'Update for requester', 2000);
  next.history = [...(prior.history || []), { status: input.status, actorId, at: new Date().toISOString() }];
  return next;
}
