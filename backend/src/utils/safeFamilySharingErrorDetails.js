import { FAMILY_COMMUNICATION_POLICY_VERSION } from '../../../frontend/src/navigation/familyCommunicationPolicy.js';

const RECOVERABLE_CODES = new Set([
  'FAMILY_SHARING_ACK_REQUIRED',
  'FAMILY_SHARED_AUDIENCE_CHANGED',
  'FAMILY_SHARED_AUDIENCE_REVIEW_REQUIRED',
  'FAMILY_SHARED_CONTEXT_REQUIRED'
]);

// A closed response shape for expected sharing-policy conflicts. Never spread an
// error or request: clinical text and recipient/contact metadata stay private.
export function safeFamilySharingErrorDetails(error) {
  if (Number(error?.status) !== 409 || !RECOVERABLE_CODES.has(error?.code)) return {};
  const details = { code: error.code };
  if (error.code === 'FAMILY_SHARING_ACK_REQUIRED') {
    const agencyId = Number(error.agencyId);
    if (Number.isSafeInteger(agencyId) && agencyId > 0) details.agencyId = agencyId;
    if (error.version === FAMILY_COMMUNICATION_POLICY_VERSION) details.version = FAMILY_COMMUNICATION_POLICY_VERSION;
  }
  return details;
}
