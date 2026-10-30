import {directCareIndirectMinutes} from '../utils/serviceCreditPolicy.js';
import { CATEGORY_LEVEL_COMPENSATION_CLAUSE } from './contractCategoryLevelCompensation.js';
import { handbookTenant } from '../services/handbookTenant.js';
import {personalRateTable, personalPayTypeDescriptions, SICK_LEAVE_RATE_POLICY} from './compensationSchedulePresentation.js';
import {HCODE_HANDBOOK_REFERENCE} from './hcodeCompensationPolicy.js';
import {TRAINING_LEAVE_CLAUSE, SCHOOL_SUPPORT_CLAUSE, SCHOOL_MILEAGE_CLAUSE, HEALTH_INSURANCE_CLAUSE} from './compensationHandbookClarifications.js';
import {ANNUAL_INDIRECT_COMMITMENT, INDIRECT_WORK_ADMINISTRATION, LEVEL_REVIEW_PROCESS, LEVEL_CHANGE_PROCESS, LEVEL_EXPECTATIONS_TITLE} from './compensationLevelExpectations.js';
import {employmentStarterClauses} from '../services/employmentStarter.service.js';
export const EMPLOYMENT_PAY_VERSION = 'category-level-employment-2026-10-14';
const escape = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const positive = value => Number.isFinite(Number(value)) && Number(value)>0;
export function employmentCategoryLevelTerms({row,tokens={},agencyName='the Practice',agencySlug=''}) {
 const p=row?.paySystem;
 if(!p)throw Object.assign(new Error('Configure the selected category and level in the current pay system before generating this clinical agreement.'),{status:400});
 const clinical=String(tokens.ROLE_LABEL).toLowerCase()!=='facilitator';
 const required=['hcodeRate','hcodeRateProbation','indirectRate','supportActivityRate',...(clinical?['creditRate','creditRateProbation']:[])];
 for(const key of required)if(!positive(p[key]))throw Object.assign(new Error(`Category ${row.category}, Level ${row.level}: confirm ${key} in the current compensation settings.`),{status:400});
 const school=handbookTenant({slug:agencySlug || tokens.AGENCY_SLUG})==='itsco' && /\bschools?\b/i.test(tokens.SERVICE_FOCUS||'');
 const schedule={...p,supportRate:p.supportActivityRate,clinicalEligible:clinical,category:Number(row.category),level:Number(row.level),autoIndirectMinutes:directCareIndirectMinutes(p.autoIndirectMinutesPerHour),tier3LevelBonus:Number(p.tierBonus?.[3]||0)};
 const adapt=s=>escape(s).replaceAll('ITSCO',escape(agencyName));
 const compensation=`<h2>Compensation · Category ${Number(row.category)}, Level ${Number(row.level)}</h2>
 <p>The individual schedule below sets the agreed rates for this appointment. Category reflects qualifications; level selects rates within that category. Workload and benefit tiers are separate. These terms replace conflicting legacy direct/indirect, hourly-or-credit and funding-percentage language for work under this agreement. Changes require advance written notice and any required agreement; earned pay and leave are preserved.</p>
 ${personalRateTable(schedule)}${personalPayTypeDescriptions(schedule).replaceAll('ITSCO',escape(agencyName))}
 <h3>Service quantities and timekeeping</h3><p>${adapt(HCODE_HANDBOOK_REFERENCE)}</p>
 <p>Pay for approved services and duties uses this schedule regardless of insurance, self-pay, grants or other funding. It is not a percentage of revenue. Record actual direct, indirect and support work in the app, separately from payer units and internal credits. Required onboarding and assigned training are paid at the applicable support activity rate. Record additional compensable work without duplicate payment. A late note, missing approval or denied claim does not erase earned wages. Applicable minimum-wage, overtime and rest-period rules continue to apply.</p>
 <h3>New-hire probation and workload</h3><p>New-hire probation lasts no more than 90 calendar days from the original Start Date and ends earlier if management ends it or the employee reaches Tier 3. A later tier decrease does not restart probation. The schedule shows the disclosed reduced rates. Minimum-workload rules and applicable waivers follow the effective handbook; the existing-provider amendment’s 60-day transition is not automatically a new-hire waiver.</p>
 <h3>Paid event work and level review</h3><p>${school?adapt(ANNUAL_INDIRECT_COMMITMENT):'The employee agrees to a minimum of four hours of assigned outreach or agency events per calendar year, paid separately at the agreed indirect hourly rate. Record actual work; these hours are not automatically added to payroll.'}</p><p>${adapt(INDIRECT_WORK_ADMINISTRATION)}</p><p>Review criteria are in the Workplace Handbook section “${LEVEL_EXPECTATIONS_TITLE}”.</p><p>${adapt(LEVEL_REVIEW_PROCESS)}</p><p>${adapt(LEVEL_CHANGE_PROCESS)}</p>`;
 const benefits=`<h2>Benefits, sick leave and reimbursements</h2><p>Paid time off, sick and personal care leave, training leave, and other eligible benefits follow the current handbook and applicable plan documents. Compensation categories, levels and benefit tiers are distinct. Health insurance contributions and other tier-based benefits follow the applicable benefit tier, enrollment requirements and plan terms. Student eligibility follows the handbook’s student-specific rules; this section does not automatically grant every employee benefit to a student. Prospective policy changes do not remove earned wages, protected leave, accrued rights or required reimbursements.</p><p>For clinical-credit services, the 1.20 equivalent is used for sick-leave accrual, not a separate 20% cash supplement: 25 credits yield 30 equivalent hours and one hour of sick leave. H-code work uses its direct and applicable indirect components once, without the clinical-credit multiplier. Separately worked indirect and support time is included. Reconcile to all actual compensable time and add any statutory shortfall; no probationary waiting period applies to protected sick leave.</p><p>${adapt(SICK_LEAVE_RATE_POLICY)}</p><p>${adapt(TRAINING_LEAVE_CLAUSE)}</p>${school?`<p>${adapt(SCHOOL_SUPPORT_CLAUSE)}</p><p>${adapt(SCHOOL_MILEAGE_CLAUSE)}</p>`:''}<p>${adapt(HEALTH_INSURANCE_CLAUSE)}</p>`;
 const legal=employmentStarterClauses().find(c=>c.clause_key==='STARTER_V1_LEGAL').body_html;
 return {compensation,benefits,legal,schedule,version:EMPLOYMENT_PAY_VERSION};
}
// Only known employment compensation/benefit blocks are replaced; unrelated
// employment clauses remain selected by the agency configuration.
export function applyEmploymentPayTerms(clauses,terms) {
 let inserted=false;
 const result=clauses.map(c=>{
  const key=String(c.clause_key||'').toUpperCase();
  if (/^(COMP_HOURLY(?:\d*|_HANDBOOK)|COMP_FFS|COMP_CATEGORY_LEVEL|FFS_TABLE\d*|STARTER_V1_(COMPENSATION|PAY_TABLE)(_(HOURLY|FFS))?)$/.test(key)){
   const html=inserted?'':terms.compensation+(key==='COMP_CATEGORY_LEVEL'?CATEGORY_LEVEL_COMPENSATION_CLAUSE.body_html:''); inserted=true;
   return {...c,body_html:html,policyVersion:terms.version,policyReason:html?'Current category/level pay schedule replaces legacy compensation':'Legacy pay block replaced by category/level schedule'};
  }
  if(/^(BENEFITS|BEN_INTERN|STARTER_V1_BENEFITS(_(HOURLY|FFS))?)$/.test(key))return {...c,body_html:terms.benefits,policyVersion:terms.version,policyReason:'Current handbook benefits and earned-pay protections'};
  if(key==='SIG_BLOCK')return {...c,body_html:c.body_html.replace(/(?:<p[^>]*>)?By signing below,[\s\S]*?<\/p>/i, '<p>By signing, the {{ROLE_LABEL}} acknowledges reviewing this Agreement and its individual compensation schedule and having an opportunity to ask questions. The Workplace Handbook is available as an optional prehire reference; its required review and acknowledgment take place during onboarding.</p>'),policyVersion:terms.version,policyReason:'Handbook access during prehire; required review during onboarding'};
  if(key==='LEGALESE')return {...c,body_html:terms.legal,policyVersion:terms.version,policyReason:'Updated remedies preserve earned wages'};
  return c;
 });
 if(!inserted)throw Object.assign(new Error('This clinical contract configuration has no recognized compensation clause. Link its pay clause to the category/level schedule before generating.'),{status:400});
 return result;
}
