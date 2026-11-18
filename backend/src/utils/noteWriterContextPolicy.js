import { evaluateClientSessionBooking } from '../services/clientSessionBookingRollout.service.js';

// A provider's scheduling transition is independent of existing text-only writer
// access. This flag never authorizes a chart note, appointment or signature.
export function noteWriterContextPolicy({ agencyId, providerUserId, featureFlags, careEligibility, quickCopyEnabled = false, conversionPending = false, accountReady = true }) {
  const individualSchedulingEnabled = accountReady && !conversionPending && careEligibility?.canProvideCare === true
    && evaluateClientSessionBooking(featureFlags?.clientSessionBookingRollout, providerUserId).enabled;
  return {
    individualSchedulingEnabled,
    therapyNotesWriterOnly: Number(agencyId) === 2 && !individualSchedulingEnabled && quickCopyEnabled,
    therapyNotesQuickCopyEnabled: quickCopyEnabled,
    linkedProgressNotesRequireSession: true
  };
}
