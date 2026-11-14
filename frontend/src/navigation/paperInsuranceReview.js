import { policyIsMedicaid } from './insurancePaymentPolicy.js';

const nameKey = value => String(value || '').normalize('NFKC').trim().replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
export const isColoradoMedicaidPolicy = policy => ['COCHA','SKCO0'].includes(String(policy?.eligibilityPayerId || policy?.payerId || '').toUpperCase());

// A paper holder is evidence of possible ownership, even after the entry form
// has prepared the child's subscriber fields. Never send that questionable ID.
export function medicaidMemberIdNeedsDiscovery(policy, patient) {
  if (!policyIsMedicaid(policy) && !isColoradoMedicaidPolicy(policy)) return false;
  const child = patient?.firstName && patient?.lastName ? nameKey(`${patient.firstName} ${patient.lastName}`) : '';
  const sourceStillApplies = !policy?.paperReportedMemberId || policy.memberId === policy.paperReportedMemberId;
  const savedHolder = policy?.subscriberFirstName && policy?.subscriberLastName ? `${policy.subscriberFirstName} ${policy.subscriberLastName}` : policy?.subscriberName;
  const holder = sourceStillApplies && policy?.paperSubscriberName ? policy.paperSubscriberName : savedHolder;
  // The listed holder decides whether to use this number. Colorado requests
  // still send the client's own DOB and subscriber loop, including legacy
  // records whose relationship or subscriber DOB was entered incorrectly.
  if(holder && child)return nameKey(holder)!==child;
  if (policy?.relationshipToSubscriber && policy.relationshipToSubscriber !== 'self') return true;
  if (policy?.subscriberFirstName && patient?.firstName && nameKey(policy.subscriberFirstName) !== nameKey(patient.firstName)) return true;
  if (policy?.subscriberLastName && patient?.lastName && nameKey(policy.subscriberLastName) !== nameKey(patient.lastName)) return true;
  if (policy?.subscriberDob && patient?.dateOfBirth && policy.subscriberDob !== patient.dateOfBirth) return true;
  return false;
}

// Older OCR entries may already contain the child's subscriber defaults. Bind
// the original listed holder by the exact number, even if its slot was misread.
export function withPaperPolicyHolders(insurance, candidate) {
  if(!insurance || !candidate)return insurance;
  const next={...insurance};
  for(const slot of ['primary','secondary']) {
    const policy=insurance[slot];if(!policy?.memberId)continue;
    const holders=[['memberId','policyHolder'],['secondaryMemberId','secondaryHolder']]
      .filter(([id,holder])=>candidate[id]&&candidate[holder]&&String(candidate[id]).trim()===String(policy.memberId).trim()).map(([,holder])=>candidate[holder]);
    if(holders.length)next[slot]={...policy,paperSubscriberName:[...new Set(holders)].join(' / '),paperReportedMemberId:policy.memberId};
  }
  return next;
}
export const clientSubscriber = patient => ({
  relationshipToSubscriber: 'self', subscriberFirstName: patient?.firstName || '', subscriberLastName: patient?.lastName || '',
  subscriberDob: patient?.dateOfBirth || '', subscriberSex: patient?.sex || '', subscriberAddressLine1: patient?.addressLine1 || '',
  subscriberAddressLine2: patient?.addressLine2 || '', subscriberCity: patient?.city || '', subscriberState: patient?.state || '', subscriberPostalCode: patient?.postalCode || ''
});

export function insuranceSubscriberIssues(policy, patient, {allowUnspecified = false} = {}) {
  if (!policyIsMedicaid(policy) && !['COCHA','SKCO0'].includes(String(policy?.payerId || '').toUpperCase())) return [];
  if(allowUnspecified && !policy?.relationshipToSubscriber && !policy?.subscriberFirstName && !policy?.subscriberLastName && !policy?.subscriberName)return [];
  const self=policy?.relationshipToSubscriber==='self';
  const sameName = nameKey(policy?.subscriberFirstName || (self ? patient?.firstName : '')) === nameKey(patient?.firstName)
    && nameKey(policy?.subscriberLastName || (self ? patient?.lastName : '')) === nameKey(patient?.lastName) && !!patient?.firstName && !!patient?.lastName;
  if (policy?.relationshipToSubscriber !== 'self' || !sameName || (policy.subscriberDob && patient?.dateOfBirth && policy.subscriberDob !== patient.dateOfBirth)) {
    return ['Medicaid must be checked for this client using their own legal name, birth date and member ID. The saved subscriber is not confirmed as the client.'];
  }
  return [];
}

export function paperCoverageFromCandidate(parsed, patient) {
  const result = {};
  for (const [slot, carrier, member, group, holder] of [
    ['primary', 'primaryInsurance', 'memberId', 'policyGroup', 'policyHolder'],
    ['secondary', 'secondaryInsurance', 'secondaryMemberId', 'secondaryGroup', 'secondaryHolder']
  ]) {
    if (![carrier, member, group, holder].some(key => parsed?.[key])) continue;
    const parts = String(parsed[holder] || '').trim().split(/\s+/).filter(Boolean);
    let policy = { insurerName: parsed[carrier] || '', memberId: parsed[member] || '', groupNumber: parsed[group] || '',
      subscriberName: parsed[holder] || '', subscriberFirstName: parts[0] || '', subscriberLastName: parts.slice(1).join(' '),
      paperSubscriberName: parsed[holder] || '', paperReportedMemberId: parsed[member] || '' };
    policy.isMedicaid = policyIsMedicaid(policy);
    if (patient?.firstName && patient?.lastName && (policy.isMedicaid || nameKey(parsed[holder]) === nameKey(`${patient.firstName} ${patient.lastName}`))) {
      policy = { ...policy, ...clientSubscriber(patient) };
    }
    result[slot] = policy;
  }
  return result;
}

export function matchConfiguredPayer(policy, payers = []) {
  const matches = payers.filter(payer => (payer.names || [payer.name]).some(name => nameKey(name) === nameKey(policy?.insurerName))
    && (!policy?.payerId || policy.payerId === payer.payerId));
  return matches.length === 1 ? matches[0] : null;
}
export const withConfiguredPayer = (policy, payer) => ({ ...policy, payerCatalogId: String(payer.id), insurerName: payer.name,
  payerId: payer.payerId, eligibilityPayerId: payer.eligibilityPayerId, isMedicaid: payer.isMedicaid === true });
