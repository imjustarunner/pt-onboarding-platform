import {withContractProbation,contractProbationHtml} from './contractProbationPolicy.js';
import {CONTRACT_SERVICE_ROLES,normalizeContractServiceRoles,normalizeContractServiceRoleDetails} from './contractServiceRoles.js';
export const INDIVIDUAL_ROLE_COMPENSATION_VERSION='individual-role-agreement-2026-11-12';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
/** Explicit per-person ISI terms; no category matrix, assumed wage, or payroll authorization. */
export function individualRoleCompensationTerms({tokens={},agencyName='the Practice',legal=''}) {
 if(tokens.INDIVIDUAL_COMPENSATION_BASIS!=='approved_individual_agreement')fail('Choose the approved individual-agreement compensation basis.');
 const reference=String(tokens.PRIOR_COMPENSATION_AGREEMENT_REFERENCE||'').trim();
 if(!reference)fail('Identify the approved individual compensation agreement or written offer.');
 const roles=normalizeContractServiceRoles(tokens.CONTRACT_SERVICE_ROLES,{strict:true});
 if(!roles.length)fail('Select the assigned service roles before using individual compensation terms.');
 const details=normalizeContractServiceRoleDetails(tokens.CONTRACT_SERVICE_ROLE_DETAILS||tokens.CONTRACT_EXPECTATIONS?.serviceRoleDetails);
 for(const role of roles)if(!details[role]?.compensationTerms)fail(`Complete the approved individual compensation terms for ${role}.`);
 let compensation=`<h2>Individual compensation agreement</h2><p>${esc(agencyName)} uses the employee’s expressly approved individual terms for this appointment. Approved agreement or written-offer reference: <strong>${esc(reference)}</strong>. No shared category/level rate matrix or another agency’s rates are adopted by selecting these roles.</p>${roles.map(id=>`<h3>${esc(CONTRACT_SERVICE_ROLES.find(r=>r.id===id).title)}</h3><p>${esc(details[id].compensationTerms).replace(/\n/g,'<br />')}</p>`).join('')}<h3>Work records, service eligibility and effective dates</h3><p>Record all actual compensable time. The written individual service terms must identify the pay basis, applicable indirect treatment, duties and any proposed change to prior rates. Testing administration/scoring and evaluation/reporting remain separate components; claim units and reimbursement do not determine paid work time. No wages already earned are reduced, no signature is backdated, and any changed terms apply prospectively under the completed agreement. Role selection does not authorize clinical practice, testing or payer participation. Apply the highest applicable work-location wage floor and required overtime. This agreement does not itself enable payroll or create a compensation authorization.</p>`;
 const schedule=withContractProbation({compensationBasis:'approved_individual_agreement',agreementReference:reference,serviceRoles:roles,serviceTerms:Object.fromEntries(roles.map(id=>[id,details[id]])),requiresSeparatePayrollSetup:true},tokens);
 if(tokens.PROVIDER_DESIGNATION_LEVEL!==undefined&&tokens.PROVIDER_DESIGNATION_LEVEL!==''){
  const level=Number(tokens.PROVIDER_DESIGNATION_LEVEL);
  if(!Number.isInteger(level)||level<1||level>5)fail('Choose an approved provider designation level from 1 through 5.');
  schedule.providerDesignationLevel=level;
  schedule.providerDesignationLabel=['Entry Provider','Developing Provider','Experienced Provider','Advanced Provider','Senior Provider'][level-1];
  compensation+=`<p><strong>Approved provider designation:</strong> Level ${level} — ${schedule.providerDesignationLabel}. This designation records role development and does not replace the individual service rates, grant practice authority or select a shared pay matrix. See the Workplace Handbook for the five provider designations.</p>`;
 }
 if(schedule.newHireTermsVersion)compensation+=contractProbationHtml(schedule,tokens);
 return {
  compensation,
  benefits:'<h2>Benefits and earned rights</h2><p>The current agency handbook, individual agreement and applicable plan documents govern eligibility. Preserve accrued leave, earned compensation and protected statutory rights. Record all actual work and reconcile required sick-leave accrual and use. No category-based benefit or rate is inferred from this individual service-role agreement.</p>',
  legal,
  schedule,
  version:INDIVIDUAL_ROLE_COMPENSATION_VERSION
 };
}
