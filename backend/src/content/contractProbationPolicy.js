export const CONTRACT_PROBATION_POLICY_VERSION = 'collective-explicit-probation-2026-11-13';
const fail = message => Object.assign(new Error(message), {status:400});
function originalStartDate(value) {
  const raw=String(value||'').trim();if(!raw||!/(?:^|\D)\d{4}(?:\D|$)/.test(raw))return null;
  const match=raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  const parsed=new Date(match?`${match}T12:00:00Z`:raw);
  if(!Number.isFinite(parsed.getTime()))return null;
  const day=parsed.toISOString().slice(0,10);return match&&day!==match?null:day;
}
export function probationChoice(tokens = {}) {
  const value=tokens.PROBATION_APPLIES ?? tokens.PROBATIONAPPLIES;
  if(value===undefined || value===null || value==='')return null;
  if(!['yes','no'].includes(String(value).toLowerCase()))throw fail('Choose Yes or No for new-hire probation.');
  return String(value).toLowerCase()==='yes';
}
export function contractNeedsProbationChoice(agencySlug, config = {}, agreementPlan = null) {
  if(!['itsco','nlu','tisi','innerstrength','inner-strength','theinnerstrengthinstitute','the-inner-strength-institute','nextlevelup','nextleveluplcc','next-level-up','nlu-qa-demo','nlu-qa-learning'].includes(String(agencySlug||'').toLowerCase()))return false;
  if(/amendment|addendum|acknowledg/i.test(config.slug||''))return false;
  return ['provider','facilitator','student'].includes(agreementPlan?.variant) || ['hourly','ffs'].includes(config.pay_mode) || /intern_practicum/.test(config.slug||'');
}
export function assertContractProbationChoice({agencySlug,config,agreementPlan,tokens}) {
  if(!contractNeedsProbationChoice(agencySlug,config,agreementPlan))return;
  const choice=probationChoice(tokens);
  if(choice===null)throw fail('Select Yes or No for new-hire probation before preparing this agreement.');
  if(choice&&!originalStartDate(tokens.START_DATE))throw fail('Enter the original employment start date before applying new-hire probation.');
  if(choice && ['tisi','innerstrength','inner-strength','theinnerstrengthinstitute','the-inner-strength-institute'].includes(agencySlug) && !String(tokens.PROBATION_TERMS||'').trim())throw fail('State the approved individual probation duration and compensation terms, or choose No.');
}
// Invoked only while rendering a new agreement, never while reading a signed one.
export function withContractProbation(profile,tokens={}) {
  const choice=probationChoice(tokens);
  if(choice===null)return {...profile};
  const result={...profile,newHireTermsVersion:CONTRACT_PROBATION_POLICY_VERSION,probationApplies:choice,probationWaived:!choice,minimumWorkloadEnabled:false,minimumWorkloadWaived:true};
  const originalStart=originalStartDate(tokens.START_DATE);
  if(originalStart)result.originalProbationStartDate=originalStart;
  if(!choice)for(const [base,reduced] of [['creditRate','creditRateProbation'],['hcodeRate','hcodeRateProbation'],['indirectRate','indirectRateProbation'],['supportRate','supportRateProbation'],['supportActivityRate','supportActivityRateProbation'],['tutoringRate','tutoringRateProbation'],['homeworkHelpRate','homeworkHelpRateProbation'],['h2014Rate','h2014RateProbation'],['testingAdministrationRate','testingAdministrationRateProbation'],['testingEvaluationRate','testingEvaluationRateProbation']])if(result[base]!=null)result[reduced]=result[base];
  return result;
}
export function contractProbationHtml(profile,tokens={}) {
  if(!profile.newHireTermsVersion)return null;
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return `<h3>New-hire probation · ${profile.probationApplies?'Yes':'No'}</h3><p>${profile.probationApplies?'The parties expressly selected new-hire probation. The stated probationary rates apply only during the applicable original new-hire period: no more than 90 calendar days for general clinical/direct-care rates and the separately disclosed period for program rates, ending earlier if management ends probation or the applicable handbook criterion is met. Later role changes, category changes and agreements do not restart probation.':'The parties expressly selected no new-hire probation. The agreed regular rates apply without a new-hire probation reduction.'} Minimum-workload rate reductions are not activated by this agreement. Existing earned pay, accrued rights and any greater agreed waiver are preserved.</p>${tokens.PROBATION_TERMS?`<p><strong>Approved individual probation terms:</strong> ${escape(tokens.PROBATION_TERMS)}</p>`:''}`;
}
