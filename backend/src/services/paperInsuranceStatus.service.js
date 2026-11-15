import {coverageInsuranceFingerprint,paperInsuranceIsReviewed} from '../utils/paperInsuranceReviewGate.js';
import {eligibilityIdentityInputs} from '../utils/eligibilityIdentityInputs.js';

export async function paperInsuranceStatus({agencyId,clientId,insurance,findings=[]},db) {
  if(!insurance?.paperReviewRequired)return null;
  const fingerprint=coverageInsuranceFingerprint(insurance),reviewed=paperInsuranceIsReviewed(insurance);
  let job=null;
  try {const [rows]=await db.execute('SELECT id,status FROM intake_eligibility_jobs WHERE agency_id=? AND client_id=? AND insurance_fingerprint=? ORDER BY id DESC LIMIT 1',[agencyId,clientId,fingerprint]);job=rows[0] || null;}
  catch(error){if(error.code!=='ER_NO_SUCH_TABLE')throw error;}
  const policies=['primary','secondary'].filter(slot=>insurance[slot]).map(slot=>{
    const finding=findings.find(item=>item.slot===slot&&item.isCurrent===true);
    const missing=eligibilityIdentityInputs(insurance,slot).missing;
    const state=!reviewed?(insurance.paperFinalizedAt?'needs_review':'awaiting_review'):missing.length?'needs_details':['pending','processing'].includes(job?.status)?'queued':!finding?'not_checked':!finding.response?'request_failed':finding.identityMatches===false?'identity_mismatch':finding.status==='active_reported'&&finding.identityMatches===true?'active_reported':finding.status==='inactive_reported'?'inactive_reported':'needs_review';
    return {slot,status:state,missingFields:missing,checkedAt:finding?.checkedAt || null,otherCoverageReported:finding?.otherCoverageReported===true};
  });
  return {reviewed,documentId:insurance.paperSourceDocumentId,jobStatus:job?.status || null,policies};
}
