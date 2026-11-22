import { isQaEmailAgency } from './qaEmailPolicy.js';
/** Transport acceptance is not inbox delivery. A reviewed QA redirect is still
 * an accepted send to the testing inbox, not an uncertain-send failure. */
export function notificationTransportReceipt(result, agencyId, { qaAgencyVerified = false } = {}) {
  const externalId = result?.id || result?.sid || result?.messageId || result?.messageUuid || result?.messageUUID || null;
  const proof = result?.testInboxRedirect;
  // Dynamic Plotline QA companies are verified by their persisted company row
  // at the caller, rather than extending a global hard-coded agency list.
  const qaRedirect = (isQaEmailAgency(agencyId) || qaAgencyVerified === true) && Number(proof?.agencyId) === Number(agencyId)
    && Array.isArray(proof?.deliveredTo) && proof.deliveredTo.length === 1
    && proof.deliveredTo[0] === 'testing@itsco.health';
  return { externalId, accepted: !!externalId && !result?.skipped && !result?.blocked && !result?.pendingApproval
    && !result?.queued && (!result?.redirected || qaRedirect),
  ...(qaRedirect ? { redirectedTo: 'testing@itsco.health' } : {}) };
}
