import { requiredCardSlots, cardUrlKey } from '../services/insuranceCards/policy.js';
/** Enrollment and the portal share the same policy requirements. */
export function missingInsuranceCards(coverage) {
  return requiredCardSlots(coverage || {}).filter(slot => {
    const [policy, side] = slot.split('_');
    return !coverage[`${policy}Card${side === 'front' ? 'Front' : 'Back'}Url`] && !coverage[cardUrlKey(slot)];
  });
}
