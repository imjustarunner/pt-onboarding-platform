import crypto from 'node:crypto';

const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export const insuranceIdentityFingerprint=insurance=>crypto.createHash('sha256').update(JSON.stringify(canonical({primary:insurance?.primary||null,secondary:insurance?.secondary||null,patient:insurance?.patient||null}))).digest('hex');
export const paperInsuranceIsReviewed=insurance=>insurance?.paperReviewRequired!==true || !!(insurance.paperReview?.approvalId && insurance.paperReview?.finalizedAt && insurance.paperFinalizedAt===insurance.paperReview.finalizedAt && insurance.paperReview?.reviewedAt && insurance.paperReview?.reviewedByUserId && Number(insurance.paperReview.documentId)===Number(insurance.paperSourceDocumentId) && insurance.paperReview.fingerprint===insuranceIdentityFingerprint(insurance));
export function coverageInsuranceFingerprint(insurance) {
  if(!insurance?.paperReviewRequired)return insuranceIdentityFingerprint(insurance);
  return crypto.createHash('sha256').update(JSON.stringify(canonical({primary:insurance.primary||null,secondary:insurance.secondary||null,patient:insurance.patient||null,paperDocumentId:insurance.paperSourceDocumentId||null,paperApprovalId:paperInsuranceIsReviewed(insurance)?insurance.paperReview.approvalId:null}))).digest('hex');
}
export function assertPaperInsuranceReviewed(insurance) {
  if(!paperInsuranceIsReviewed(insurance))throw Object.assign(new Error('Submit the completed paper packet before requesting eligibility. Draft saves and insurance-step confirmation do not authorize a payer inquiry.'),{status:409,code:'PAPER_INSURANCE_REVIEW_REQUIRED'});
}
