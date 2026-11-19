// Shared by the browser and backend; keep this module dependency-free.
// Carrier labels are a protective signal, not proof of eligibility. Unknown
// service classifications stay on billing review when Medicaid is recorded.
export function policyIsMedicaid(policy) {
  if(['commercial','medicaid','tricare','medicare'].includes(policy?.programType))return policy.programType==='medicaid';
  return policy?.isMedicaid === true || policy?.isMedicaid === 1
    || /\bmedicaid\b|health\s+first\s+colorado|\bccha\b|colorado\s+community\s+health\s+alliance/i.test(String(policy?.insurerName || ''))
    || /\bmedicaid\b/i.test(String(policy?.planType || ''));
}
// A carrier can administer several programs. Preserve a reviewed program for this
// policy, and clear the previous program when the user selects a different carrier.
export function applyConfiguredCarrier(policy, payer) {
  const normalize = name => String(name || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const sameCarrier = !!(policy.payerId || policy.insurerName)
    && (!policy.payerCatalogId || String(policy.payerCatalogId) === String(payer.id))
    && (!policy.payerId || policy.payerId === payer.payerId)
    && (!policy.insurerName || [payer.name, ...(payer.names || [])].some(name => normalize(name) === normalize(policy.insurerName)));
  const result = {...policy, insurerName:payer.name, payerId:payer.payerId, eligibilityPayerId:payer.eligibilityPayerId,
    isMedicaid:payer.isMedicaid === true || (sameCarrier && policy.isMedicaid === true)};
  if (!sameCarrier) {
    delete result.programType;
    delete result.planType;
  }
  return result;
}
// One electronic payer route may handle multiple actual insurance policies.
// Identical policies must never become two payer orders by copying a slot.
export function distinctInsurancePolicies(primary, secondary) {
  if (!primary?.payerId || !secondary?.payerId) return false;
  if (primary.payerId !== secondary.payerId) return true;
  const memberA=String(primary.memberId || '').trim(),memberB=String(secondary.memberId || '').trim();
  const groupA=String(primary.groupNumber || '').trim(),groupB=String(secondary.groupNumber || '').trim();
  return !!(memberA && memberB && (memberA!==memberB || (groupA && groupB && groupA!==groupB)));
}
export function hasMedicaidCoverage(info) {
  if (!info) return false;
  return info.primaryIsMedicaid === true || info.primaryIsMedicaid === 1
    || policyIsMedicaid(info.primary) || policyIsMedicaid(info.secondary)
    // A required review can clear confirmation without removing the declared
    // payer. Keep payment suppressed while that Medicaid policy is reviewed.
    || (Array.isArray(info.clientCoverages) && info.clientCoverages.some(c =>
      policyIsMedicaid(c.primary) || policyIsMedicaid(c.secondary)));
}
export function isNonClinicalPaymentChannel(channel) {
  return ['tutoring', 'coaching', 'consulting', 'mentorship'].includes(String(channel || '').toLowerCase());
}
export function shouldSuppressInsurancePayment(info, channel) {
  return hasMedicaidCoverage(info) && !isNonClinicalPaymentChannel(channel);
}
