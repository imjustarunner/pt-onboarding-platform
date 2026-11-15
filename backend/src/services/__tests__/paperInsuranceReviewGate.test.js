import {it,expect,vi} from 'vitest';
vi.mock('../../config/database.js',()=>({default:{execute:vi.fn()},onTableWrite:vi.fn()}));
vi.mock('../../config/clinicalDatabase.js',()=>({default:{execute:vi.fn()}}));
vi.mock('../familyBillingPolicy.service.js',()=>({billingError:(status,message)=>Object.assign(new Error(message),{status}),auditBilling:vi.fn(),positiveId:Number}));
import {buildEligibilityRequest,runCoverageCheck} from '../coverageVerification.service.js';
import {processIntakeEligibility,enqueueIntakeEligibility} from '../intakeEligibility.service.js';
import {insuranceIdentityFingerprint,paperInsuranceIsReviewed,coverageInsuranceFingerprint} from '../../utils/paperInsuranceReviewGate.js';
import {paperInsuranceStatus} from '../paperInsuranceStatus.service.js';
import {eligibilityProfileRecord} from '../eligibilityProfile.service.js';
const patient={firstName:'Synthetic',lastName:'Child',dateOfBirth:'2023-09-20',state:'CO'};
const insurance=()=>({primary:{isMedicaid:true,eligibilityPayerId:'SKCO0',memberId:'A123456'},patient,paperReviewRequired:true,paperSourceDocumentId:9});
const profile={billingNpi:'1306688650',practice:{tax_id:'123456789',name:'Synthetic fixture'}};
const confirm=value=>({...value,paperFinalizedAt:'2026-11-15T12:00:00Z',paperReview:{finalizedAt:'2026-11-15T12:00:00Z',approvalId:'synthetic-approval',documentId:9,reviewedByUserId:42,reviewedAt:'2026-11-15T12:00:00Z',fingerprint:insuranceIdentityFingerprint(value)}});
it('blocks manual and demographic requests before any database reservation or payer call',async()=>{
 const value=insurance(),request=vi.fn(),db={execute:vi.fn()};
 for(const lookupMode of ['member_id','demographics'])expect(()=>buildEligibilityRequest({insurance:value,slot:'primary',profile,serviceDate:'2026-11-15',lookupMode})).toThrow('Submit the completed');
 await expect(runCoverageCheck({agencyId:2,clientId:4,slot:'primary',profile,serviceDate:'2026-11-15',requestKey:'unreviewed-fixture'},{db,request,readInsurance:async()=>value})).rejects.toMatchObject({code:'PAPER_INSURANCE_REVIEW_REQUIRED'});expect(request).not.toHaveBeenCalled();expect(db.execute).not.toHaveBeenCalled();
});
it('binds confirmation to both policies, the patient and the selected source document',()=>{
 const value=confirm({...insurance(),secondary:{insurerName:'Other coverage',memberId:'SECOND'}});expect(paperInsuranceIsReviewed(value)).toBe(true);expect(buildEligibilityRequest({insurance:value,slot:'primary',profile,serviceDate:'2026-11-15'}).ins_number).toBe('A123456');
 for(const patch of [{primary:{...value.primary,memberId:'CORRECTED'}},{secondary:{...value.secondary,memberId:'EDIT'}},{patient:{...patient,dateOfBirth:'2023-09-21'}},{paperSourceDocumentId:10}])expect(paperInsuranceIsReviewed({...value,...patch})).toBe(false);
});
it('keeps pre-confirmation attempts outside the newly approved request identity',()=>{
 const draft=insurance(),reviewed=confirm(draft);expect(coverageInsuranceFingerprint(draft)).not.toBe(coverageInsuranceFingerprint(reviewed));expect(coverageInsuranceFingerprint(reviewed)).toBe(coverageInsuranceFingerprint(structuredClone(reviewed)));expect(coverageInsuranceFingerprint({...reviewed,paperSourceDocumentId:10})).not.toBe(coverageInsuranceFingerprint(reviewed));
});
it('does not enqueue or transmit a legacy pending paper job before review',async()=>{
 const value=insurance(),db={execute:vi.fn(async sql=>sql.includes('feature_flags')?[[{feature_flags:{intakeEligibilityAutomation:{enabled:true},medicalBillingEnabled:true}}]]:[[]])};
 expect(await enqueueIntakeEligibility({agencyId:2,clientId:4},{...db,execute:async sql=>sql.includes('feature_flags')?[[{feature_flags:{}}]]:[[ {billing_insurance_payload:null,source:'SCHOOL_UPLOAD'} ]]})).toMatchObject({status:'awaiting_paper_review'});
 const check=vi.fn(),deps={db,configurePayers:async()=>value,connection:async()=>({mode:'live'}),profile:async()=>profile,check,queueTask:vi.fn()};
 expect(await processIntakeEligibility({id:3,agency_id:2,client_id:4},{reviewer_user_id:42},{officeId:6},deps)).toBe('review_required');expect(check).not.toHaveBeenCalled();
});
it('keeps no-response failures separate from identity mismatches and ignores older policy findings',async()=>{
 const value=confirm(insurance()),db={execute:vi.fn(async()=>[[{id:7,status:'review_required'}]])};
 const older={id:1,slot:'primary',isCurrent:false,response:{elig:{}},status:'active_reported',identityMatches:true};
 let status=await paperInsuranceStatus({agencyId:2,clientId:4,insurance:value,findings:[older,{slot:'primary',isCurrent:true,response:null,status:'error',identityMatches:null}]},db);expect(status.policies[0].status).toBe('request_failed');
 status=await paperInsuranceStatus({agencyId:2,clientId:4,insurance:insurance(),findings:[older]},db);expect(status.policies[0].status).toBe('awaiting_review');
 expect(eligibilityProfileRecord({insurance_fingerprint:'old'},null,'new').isCurrent).toBe(false);
});
it('shows a missing subscriber DOB on primary instead of presenting both slots as queued',async()=>{
 const value=confirm({...insurance(),primary:{payerId:'84146',memberId:'PRIMARY',subscriberFirstName:'Parent',subscriberLastName:'Fixture',relationshipToSubscriber:'child'},secondary:insurance().primary});const db={execute:vi.fn(async()=>[[{id:8,status:'pending'}]])};
 const status=await paperInsuranceStatus({agencyId:2,clientId:4,insurance:value},db);expect(status.policies[0]).toMatchObject({slot:'primary',status:'needs_details',missingFields:['subscriber birth date']});expect(status.policies[1]).toMatchObject({slot:'secondary',status:'queued'});
});

it('rejects an older insurance-step approval until the packet has actually been submitted',()=>{
 const legacy=confirm(insurance());delete legacy.paperReview.finalizedAt;expect(paperInsuranceIsReviewed(legacy)).toBe(false);
 const unsubmitted=confirm(insurance());unsubmitted.paperFinalizedAt=null;expect(paperInsuranceIsReviewed(unsubmitted)).toBe(false);
});
