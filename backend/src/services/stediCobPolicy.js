import crypto from 'node:crypto';
import { billingError } from './familyBillingPolicy.service.js';
import { discoveryNpiValid, normalizeDiscoveryName, validDiscoveryDate } from './stediDiscoveryPolicy.js';
import { policyIsMedicaid } from '../utils/insurancePaymentPolicy.js';

export const cobReasons = ['other_coverage_denial','overlapping_policies','billing_order_unclear','reported_other_insurance'];
export const cobFingerprint = snapshot => crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
const fail = message => { throw billingError(409,message); };
const personMatches = (a,b) => ['firstName','lastName'].every(k=>a?.[k] && normalizeDiscoveryName(a[k])===normalizeDiscoveryName(b?.[k])) && validDiscoveryDate(a?.dateOfBirth) && a.dateOfBirth===b?.dateOfBirth;
const personValid = p => p?.firstName?.length>0 && p.firstName.length<=35 && p?.lastName?.length>0 && p.lastName.length<=60 && validDiscoveryDate(p.dateOfBirth) && p.dateOfBirth<=new Date().toISOString().slice(0,10);
export function cobSubscriber(policy,patient) {
  return policy.relationshipToSubscriber==='self' ? {firstName:patient.firstName,lastName:patient.lastName,dateOfBirth:patient.dateOfBirth,memberId:policy.memberId} : {firstName:policy.subscriberFirstName,lastName:policy.subscriberLastName,dateOfBirth:policy.subscriberDob,memberId:policy.memberId};
}
export function validateCobConfirmation(input,snapshot,now=new Date()) {
  const policy=snapshot.insurance?.[input.slot];
  if (!['primary','secondary'].includes(input.slot) || !policy?.insurerName || !policy.memberId || snapshot.insurance.verifiedForClaims!==true) fail('Save and verify the known policy and subscriber details before checking overlapping coverage.');
  if (!['self','child','spouse','other'].includes(policy.relationshipToSubscriber) || !personValid(snapshot.patient) || !personValid(cobSubscriber(policy,snapshot.patient)) || !/^[A-Za-z0-9-]{1,80}$/.test(policy.memberId)) fail('Complete the saved legal names, birthdates, subscriber relationship and member ID, including its prefix.');
  if (policy.relationshipToSubscriber==='self' && !personMatches(cobSubscriber(policy,snapshot.patient),{firstName:policy.subscriberFirstName,lastName:policy.subscriberLastName,dateOfBirth:policy.subscriberDob})) fail('The saved self-subscriber details differ from the client identity. Correct the policy first.');
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const earliest=new Date(`${today}T00:00:00Z`);earliest.setUTCFullYear(earliest.getUTCFullYear()-2);
  if (!validDiscoveryDate(input.serviceDate) || input.serviceDate>today || input.serviceDate<earliest.toISOString().slice(0,10)) fail('Choose a service date within the past two years, through today.');
  if ((policy.effectiveDate && input.serviceDate<policy.effectiveDate) || (policy.terminationDate && input.serviceDate>policy.terminationDate)) fail('The selected policy does not cover the requested date according to its saved coverage dates.');
  if (input.fingerprint!==cobFingerprint(snapshot)) fail('Saved insurance changed. Reopen the check and confirm the current details.');
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(input.requestKey || '') || !/^[A-Z]{5}$/.test(input.stediPayerId || '')) fail('Choose a participating payer and reopen the check if needed.');
  if (!cobReasons.includes(input.reason)) fail('Choose why coordination of benefits needs investigation.');
  for (const key of ['nameConfirmed','birthdateConfirmed','addressConfirmed','policyConfirmed','payerConfirmed','costConfirmed']) if(input[key]!==true) fail('Confirm names, birthdates, address, active policy/member ID, payer and the paid check.');
  if (input.freshSearch===true && (typeof input.repeatReason!=='string' || input.repeatReason.trim().length<10 || input.repeatReason.length>500)) fail('Explain why a fresh paid check is needed instead of the saved result.');
}
export function stediCobPayload(input,snapshot,office,payer) {
  if (!office || !discoveryNpiValid(office.practice_npi) || !office.practice_name?.trim() || office.practice_name.length>60) fail('Choose this agency’s billing office with a valid group NPI and a practice name of at most 60 characters.');
  if (payer?.stediId!==input.stediPayerId || payer.transactionSupport?.coordinationOfBenefits!=='SUPPORTED' || typeof payer.primaryPayerId!=='string' || !payer.primaryPayerId || payer.primaryPayerId.length>80) fail('This payer is not currently available for Stedi coordination of benefits.');
  const policy=snapshot.insurance[input.slot],patient=snapshot.patient;
  return {tradingPartnerServiceId:payer.primaryPayerId,provider:{npi:office.practice_npi,organizationName:office.practice_name},subscriber:cobSubscriber(policy,patient),
    ...(policy.relationshipToSubscriber==='self'?{}:{dependent:{firstName:patient.firstName,lastName:patient.lastName,dateOfBirth:patient.dateOfBirth}}),encounter:{dateOfService:input.serviceDate,serviceTypeCode:'30'}};
}
export function cobFindings(response,request) {
  const list=value=>Array.isArray(value)?value:[];
  const payload=request.payload,expected=payload.dependent || payload.subscriber,person=payload.dependent?response.dependent:response.subscriber;
  const identityMatches=personMatches(person,expected) && personMatches(response.subscriber,payload.subscriber) && response.subscriber?.memberId===payload.subscriber.memberId;
  const errorLists=[response.errors,response.subscriber?.aaaErrors,response.dependent?.aaaErrors,response.provider?.aaaErrors,response.payer?.aaaErrors];
  const errors=errorLists.flatMap(list);
  const findings=[],seen=new Set();
  for (const benefit of list(response.benefitsInformation).filter(b=>b && typeof b==='object')) {
    const entities=list(benefit.benefitsRelatedEntities).filter(e=>e && typeof e==='object'),member=entities.find(e=>e.entityIdentification==='MI');
    for (const payer of entities.filter(e=>e.entityIdentification==='PI')) {
      const key=JSON.stringify([payer,member,benefit.benefitsDateInformation,benefit.serviceTypeCodes]);if(seen.has(key))continue;seen.add(key);
      const order=({'Primary Payer':'primary','Secondary Payer':'secondary','Tertiary Payer':'tertiary'})[payer.entityIdentifier] || 'undetermined';
      findings.push({index:findings.length,payerName:payer.entityName || '',reportedPayerId:payer.entityIdentificationValue || '',order,memberId:member?.entityIdentificationValue || '',dates:benefit.benefitsDateInformation || {},serviceTypes:list(benefit.serviceTypes),serviceTypeCodes:list(benefit.serviceTypeCodes),
        policy:{insurerName:payer.entityName || '',memberId:member?.entityIdentificationValue || '',subscriberFirstName:member?.entityFirstname || '',subscriberLastName:member?.entityLastname || '',subscriberDob:benefit.subscriber?.dateOfBirth || '',payerId:'',eligibilityPayerId:''}});
    }
  }
  const cob=response.coordinationOfBenefits || {},issues=[];
  if(response.httpError)issues.push('Stedi returned an HTTP error. Review its saved response and reconcile the attempt before another paid check.');
  if(request.insuranceChangedWhileChecking)issues.push('Saved insurance changed while this check was running. Reconcile the response against the current billing profile.');
  if(errorLists.some(v=>v!==undefined && !Array.isArray(v)) || !Array.isArray(response.benefitsInformation) || list(response.benefitsInformation).some(b=>!b || typeof b!=='object'))issues.push('The response contains unexpected field types. Review the full saved response.');
  if(errors.length)issues.push('The payer returned an error. Check the submitted policy and the saved full response.');
  if(!identityMatches)issues.push('The returned identity or member ID is missing or differs from the submitted policy. Verify it with the payer.');
  if(!['MemberFoundNoCob','CobInstanceExistsPrimacyDetermined','CobInstanceExistsPrimacyUndetermined','CoverageOverlapNoBenefitOverlap','CoverageOverlapExistsNotSubjectToCob'].includes(cob.classification))issues.push('The response is incomplete or has an unfamiliar coordination status.');
  if(cob.coverageOverlap===true || findings.length || list(response.benefitsInformation).some(b=>b?.code==='R'))issues.push('Reconcile the reported coverage with saved policies and their billing order.');
  if(cob.instanceExists===true && cob.primacyDetermined!==true)issues.push('Stedi could not determine billing order. Obtain confirmation from the payers.');
  const otherSlot=request.slot==='primary'?'secondary':'primary';
  if(cob.classification==='MemberFoundNoCob' && request.snapshot.insurance?.[otherSlot]?.memberId)issues.push('Another policy is already recorded. A negative COB result cannot remove that coverage.');
  if(cob.classification==='MemberFoundNoCob' && (cob.coverageOverlap!==false || cob.instanceExists!==false || cob.benefitOverlap!==false))issues.push('The response does not consistently confirm no overlapping coverage.');
  if(policyIsMedicaid(request.snapshot.insurance?.primary) && request.snapshot.insurance?.secondary)issues.push('Resolve Medicaid billing order before submitting claims.');
  if(!errors.length && !list(response.benefitsInformation).some(b=>b?.code==='1'))issues.push('Active coverage was not explicitly returned for this request.');
  return {identityMatches,classification:cob.classification || 'Incomplete response',coverageOverlap:cob.coverageOverlap ?? null,primacyDetermined:cob.primacyDetermined ?? null,findings,issues,reviewRequired:issues.length>0};
}
