import {NLU_COMPENSATION_POLICY_VERSION,NLU_COMPENSATION_CATEGORIES,NLU_PAY_LEVELS,nluChildcareRate,nluTutoringRate} from './nluCompensationPolicy.js';
import {nluCategoryDefinitionsHtml,WAGE_FLOOR_HTML} from './providerRolesNovember2026.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dollars=value=>value==null?'[confirm]':`$${Number(value).toFixed(2)}`;
export const isNluAmendment=data=>data?.nluCompensationPolicyVersion===NLU_COMPENSATION_POLICY_VERSION||data?.schedule?.nluCompensationPolicyVersion===NLU_COMPENSATION_POLICY_VERSION;
export function nluAmendmentIssues(data) {
 const s=data.schedule||{},issues=[];
 if(!NLU_COMPENSATION_CATEGORIES[Number(s.category)])issues.push('Choose the approved NLU category.');
 if(!NLU_PAY_LEVELS.some(l=>l.level===Number(s.level)))issues.push('Choose the approved pay level.');
 if(!data.employee?.name)issues.push('Confirm the employee name.');
 if(!data.employee?.originalAgreementDate)issues.push('Identify the existing agreement being amended.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(data.effectiveDate||'')))issues.push('Confirm the prospective effective date.');
 if(!(Number(s.indirectRate)>0))issues.push('Confirm the applicable indirect hourly rate.');
 if(Number(s.category)>1)for(const field of ['creditRate','hcodeRate','supportRate','creditRateProbation','hcodeRateProbation'])if(!(Number(s[field])>0))issues.push(`Confirm ${field} for the individual schedule.`);
 if(Number(s.category)===1&&!s.childcareLevel&&!s.tutoringLevel&&!(Number(s.homeworkHelpRate)>0))issues.push('Document at least one approved nonclinical service placement and its rate.');
 for(const field of ['childcareLevel','tutoringLevel'])if(s[field]!=null&&!NLU_PAY_LEVELS.some(l=>l.level===Number(s[field])))issues.push(`Confirm the separately approved ${field}.`);
 if(s.tutoringLevel&&Number(s.category)>2&&!(Number(s.tutoringHourlyRate)>0))issues.push('Confirm the individually approved Category 3/4 tutoring rate.');
 if(s.testingAuthorized&&(!s.testingAuthorizationReference||!(Number(s.testingEvaluationRate)>0)))issues.push('Confirm testing assignment/supervision and the actual-time evaluation rate.');
 if(Number(s.category)===1&&s.testingAuthorized)issues.push('Category 1 cannot be assigned testing work.');
 if(data.employee?.employmentType==='salaried'&&data.compensationBasis!=='service_credit')issues.push('Review salary-specific terms before replacing any salary arrangement.');
 return issues;
}
export function renderNluAmendment(data) {
 const s=data.schedule||{},issues=nluAmendmentIssues(data);
 const rows=[];
 const row=(name,basis,regular,reduced)=>rows.push(`<tr><th>${esc(name)}</th><td>${esc(basis)}</td><td>${dollars(regular)}</td><td>${reduced==null?'—':dollars(reduced)}</td></tr>`);
 if(Number(s.category)>1) {
  row('Clinical Session Rate','per approved clinical credit',s.creditRate,s.creditRateProbation);
  row('General Direct Care','per direct-hour equivalent',s.hcodeRate,s.hcodeRateProbation);
 }
 row('Indirect work','per actual hour',s.indirectRate);
 if(s.supportRate!=null)row('Support activities','per actual hour',s.supportRate);
 if(s.homeworkHelpRate!=null)row('Homework Help','per actual approved hour',s.homeworkHelpRate);
 let childcare='';
 if(s.childcareLevel) {
  const rates=[1,2,3,4].map(children=>nluChildcareRate({category:s.category,level:s.childcareLevel,children,caregivers:1,individualHourlyRate:s.childcareRate??s.childcareHourlyRate}).rate);
  childcare=`<h3>Childcare placement · Level ${esc(s.childcareLevel)}</h3><p>Hourly child bands: ${rates.map((rate,i)=>`${i+1} child${i?'ren':''}: ${dollars(rate)}`).join('; ')}. Shared groups use children ÷ active caregivers rounded up for the compensation band. More than four children per active caregiver requires immediate staffing review. Required preparation, cleanup and zero-child on-duty availability use the approved one-child base unless another assignment/rate was established in advance. No automatic indirect allowance is added to childcare. Ratios do not establish lawful program staffing.</p>`;
 }
 let tutoring='';
 if(s.tutoringLevel) {
  try {
   const virtual=nluTutoringRate({category:s.category,level:s.tutoringLevel,format:'virtual',individualHourlyRate:s.tutoringHourlyRate});
   const inPerson=nluTutoringRate({category:s.category,level:s.tutoringLevel,format:'in_person',individualHourlyRate:s.tutoringHourlyRate});
   tutoring=`<h3>Tutoring placement · Level ${esc(s.tutoringLevel)}</h3><p>Virtual: ${dollars(virtual)}/hour. In person: ${dollars(inPerson)}/hour. Approved tutoring receives 10 indirect minutes per direct hour at ${dollars(s.indirectRate)}/hour, prorated; reconcile additional actual work without duplicate pay. Existing individual overrides remain effective unless this completed agreement expressly replaces them.</p>`;
  } catch {tutoring='<p>Complete the approved individual tutoring placement and rate before issue.</p>';}
 }
 const testing=s.testingAuthorized?`<h3>Separately authorized testing work</h3><p>Authorization/supervision reference: ${esc(s.testingAuthorizationReference||'[complete]')}. Approved administration/scoring and eligible clinical telephone work pay actual minutes ÷ 60 × ${dollars(s.hcodeRate)} plus the ten-minute prorated indirect allowance. Approved evaluation/interpretation/report/feedback pay actual minutes ÷ 60 × ${dollars(s.testingEvaluationRate)} without an automatic indirect supplement. These amounts are hourly actual-time rates, not CPT units or clinical credits. Authorization remains subject to the individual’s qualifications, the instrument, direct supervision and payer requirements.</p>`:'';
 return `<h1>Next Level Up, LLC</h1><h2>Individual Compensation Amendment · November 2026</h2><p><strong>Editable draft — not issued or signed.</strong></p>${issues.length?`<p><strong>Complete before issue:</strong> ${issues.map(esc).join(' ')}</p>`:''}<p>Employee: ${esc(data.employee?.name)}. Prior agreement: ${esc(data.employee?.originalAgreementDate||'[confirm]')}. Proposed effective date: ${esc(data.effectiveDate||'[confirm]')}. Category ${esc(s.category)} · ${esc(NLU_COMPENSATION_CATEGORIES[Number(s.category)]?.label||'[confirm]')}; Pay Level ${esc(s.level)}.</p><p>Policy version: ${NLU_COMPENSATION_POLICY_VERSION}. This amendment takes effect prospectively under the completed individual terms and actual employee/agency signatures. No signature is backdated. Preserve prior pay, leave and individual overrides except for terms expressly replaced. An amendment does not restart probation.</p><table><thead><tr><th>Pay type</th><th>Basis</th><th>Regular rate</th><th>Applicable reduced rate</th></tr></thead><tbody>${rows.join('')}</tbody></table>${childcare}${tutoring}${testing}<h3>Service authorization and category placement</h3>${nluCategoryDefinitionsHtml()}<h3>Time, workload and existing rights</h3><p>Record all actual compensable work. Clinical service-credit compensation, general Direct Care, childcare, tutoring, Homework Help, H2014 and testing retain distinct mappings. General Direct Care and approved testing administration receive the agreed ten-minute indirect allowance; evaluation time and childcare do not. Do not pay the same minutes twice. Existing sick-leave balances, earned compensation and applicable statutory accrual/use rights remain protected. The handbook’s dated workload, probation and individual waiver terms apply; the 60-day minimum-workload amendment waiver begins on this agreement’s actual prospective effective date.</p>${WAGE_FLOOR_HTML}${data.additionalTerms?`<h3>Individual terms</h3><p>${esc(data.additionalTerms)}</p>`:''}<h3>Acknowledgment and actual signatures</h3><p>The employee may read and retain this agreement before signing and request paper signing. Employee: ${esc(data.employee?.name)} — signature/date: ____________________. For NLU: ${esc(data.countersignerName||'[confirm authorized countersigner]')} — signature/date: ____________________.</p>`;
}
