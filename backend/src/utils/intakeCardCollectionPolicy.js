import {hasMedicaidCoverage,isNonClinicalPaymentChannel} from './insurancePaymentPolicy.js';
import {enrollmentCoverageFingerprint} from '../../../frontend/src/navigation/enrollmentCoveragePolicy.js';
const fail=(message,code)=>Object.assign(new Error(message),{status:409,statusCode:409,code});
/** Run before provisioning a payer or contacting Stripe, including direct API calls. */
export function assertIntakeCardCollectionAllowed({link,submission,reviewed,fingerprint,onFileInsurance=null}){
 let data=submission?.intake_data||{};if(typeof data==='string'){try{data=JSON.parse(data);}catch{throw fail('Review insurance coverage before opening payment setup.','COVERAGE_REVIEW_REQUIRED');}}
 const bag=data.responses?.submission||data.submission||data,info=bag.insuranceInfo||{};
 if(hasMedicaidCoverage(info) || (Array.isArray(onFileInsurance)&&onFileInsurance.some(policy=>hasMedicaidCoverage(policy))))throw fail('A payment card is not requested for Medicaid coverage. Return to insurance review.','MEDICAID_CARD_COLLECTION_SUPPRESSED');
 const onFile=info.useInsuranceOnFile===true;
 if(onFile && (!Array.isArray(onFileInsurance)||!onFileInsurance.length||onFileInsurance.some(policy=>!policy?.primary?.insurerName)))throw fail('Existing coverage needs review before requesting a payment card.','COVERAGE_ON_FILE_REVIEW_REQUIRED');
 const paymentOnly=isNonClinicalPaymentChannel(link?.master_channel)||(Array.isArray(link?.intake_steps)&&link.intake_steps.some(step=>step.type==='insurance_info'&&step.paymentOnly));
 if(!paymentOnly && !onFile && info.isSelfPay!==true && !String(info.primary?.insurerName||'').trim())throw fail('Enter and review primary and any secondary coverage before payment setup.','COVERAGE_REVIEW_REQUIRED');
 const current=enrollmentCoverageFingerprint(info);
 if(reviewed!==true || fingerprint!==current)throw fail('Coverage changed. Confirm primary and any secondary coverage again before opening payment setup.','COVERAGE_REVIEW_REQUIRED');
 return {fingerprint:current};
}
