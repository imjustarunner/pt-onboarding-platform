// Missing information is a staff lookup/review flag. A worker may complete paper
// entry with these gaps after explicitly confirming this is all they know.
// This is not payer verification or claim readiness.
import { insuranceSubscriberIssues,medicaidMemberIdNeedsDiscovery } from './paperInsuranceReview.js';
export const isPaperSelfPayType = type => /self[\s_-]*pay/i.test(String(type?.insurance_key || type?.label || ''));

export function paperInsuranceCompletionIssues(insurance) {
  const issues = [];
  for (const position of ['primary', 'secondary']) {
    const policy = insurance?.[position];
    if (position === 'secondary' && !policy) continue;
    const label = position === 'primary' ? 'Primary' : 'Secondary';
    issues.push(...insuranceSubscriberIssues(policy, insurance?.patient).map(issue => `${label}: ${issue}`));
    for (const [key, name] of [['insurerName', 'insurance carrier'], ['memberId', 'Member ID']]) {
      if(key==='memberId'&&medicaidMemberIdNeedsDiscovery(policy,insurance?.patient)&&insurance?.patient?.firstName&&insurance.patient.lastName&&insurance.patient.dateOfBirth)continue;
      if (!String(policy?.[key] || '').trim()) issues.push(`${label} ${name} is missing.`);
    }
    if (!['self', 'child', 'spouse', 'other'].includes(policy?.relationshipToSubscriber)) {
      issues.push(`${label} relationship to subscriber is missing.`);
    }
    const subscriber = policy?.relationshipToSubscriber === 'self' ? insurance?.patient : null;
    for (const [key, patientKey, name] of [['subscriberFirstName', 'firstName', 'first name'], ['subscriberLastName', 'lastName', 'last name']]) {
      if (!String(policy?.[key] || subscriber?.[patientKey] || '').trim()) issues.push(`${label} subscriber ${name} is missing.`);
    }
  }
  return issues;
}
