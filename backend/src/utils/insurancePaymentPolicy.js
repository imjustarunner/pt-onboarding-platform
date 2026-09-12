// Carrier labels are a protective signal, not proof of eligibility. Unknown
// service classifications stay on billing review when Medicaid is recorded.
export function policyIsMedicaid(policy) {
  return policy?.isMedicaid === true || policy?.isMedicaid === 1
    || /\bmedicaid\b|health\s+first\s+colorado/i.test(String(policy?.insurerName || ''));
}
export function hasMedicaidCoverage(info) {
  if (!info) return false;
  return info.primaryIsMedicaid === true || info.primaryIsMedicaid === 1
    || policyIsMedicaid(info.primary) || policyIsMedicaid(info.secondary)
    || (Array.isArray(info.clientCoverages) && info.clientCoverages.some(c =>
      c.confirmed === true && (policyIsMedicaid(c.primary) || policyIsMedicaid(c.secondary))));
}
export function isNonClinicalPaymentChannel(channel) {
  return ['tutoring', 'coaching', 'consulting', 'mentorship'].includes(String(channel || '').toLowerCase());
}
export function shouldSuppressInsurancePayment(info, channel) {
  return hasMedicaidCoverage(info) && !isNonClinicalPaymentChannel(channel);
}
