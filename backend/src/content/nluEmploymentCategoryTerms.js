import {isNluCompensationProfile,NLU_COMPENSATION_POLICY_VERSION,nluTutoringRate,nluChildcareRate,normalizeChildcareRatesByBand} from './nluCompensationPolicy.js';
import {nluCategoryDefinitionsHtml,WAGE_FLOOR_HTML} from './providerRolesNovember2026.js';
import {programScheduleTerms} from './programServiceRates.js';
import {inferNluContractCategory} from './contractServiceRoles.js';
import {TESTING_SERVICE_POLICY_VERSION,testingCompensationSchedule} from './testingServicePolicy.js';
import {withContractProbation,contractProbationHtml} from './contractProbationPolicy.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dollars=value=>`$${Number(value).toFixed(2)}`;
const error=message=>Object.assign(new Error(message),{status:400});
export function nluEmploymentCategoryTerms({row,tokens={},legal}) {
 const profile=row?.paySystem ? withContractProbation(row.paySystem,tokens) : null;
 if(!isNluCompensationProfile(profile))return null;
 const category=Number(row.category),level=Number(row.level);
 const roles=tokens.CONTRACT_SERVICE_ROLES||[];
 const details=tokens.CONTRACT_SERVICE_ROLE_DETAILS||tokens.CONTRACT_EXPECTATIONS?.serviceRoleDetails||{};
 if(category===1&&roles.some(r=>['bachelors_counseling','psychotherapy','psychological_testing'].includes(r)))throw error('NLU Category 1 is limited to approved nonclinical childcare, tutoring and educational duties. Choose an eligible category for the selected clinical/testing role.');
 const inferred=inferNluContractCategory({credential:String(tokens.CREDENTIAL||''),jobTitle:String(tokens.JOB_TITLE||''),role:String(tokens.ROLE_LABEL||'')});
 const exception=String(tokens.NLU_CATEGORY_PLACEMENT_EXCEPTION_REFERENCE||'').trim();
 if(((category===3&&(inferred==null||inferred<3))||(category===4&&inferred!==4))&&!exception)throw error('Document the written NLU placement-exception approval, qualifications, responsibilities, supervision and effective date before using this category.');
 const schedule=withContractProbation({...profile,nluCompensationPolicyVersion:NLU_COMPENSATION_POLICY_VERSION,category,level,supportRate:profile.supportActivityRate,clinicalEligible:roles.includes('psychotherapy'),autoIndirectMinutes:category===1?0:10},tokens);
 if(exception)schedule.placementExceptionReference=exception;
 const exceptionHtml=exception?`<p><strong>Written placement-exception approval:</strong> ${escape(exception)}. The approval covers compensation placement only; it does not expand professional or payer authority.</p>`:'';
 if(category>1) {
  const program=programScheduleTerms({tenant:'nlu',category:category-1,level});
  for(const key of ['programRatesVersion','programTenant','programProbationDays','homeworkHelpRate','homeworkHelpRateProbation','h2014Rate','h2014RateProbation'])if(program[key]!=null)schedule[key]=program[key];
  Object.assign(schedule,withContractProbation(schedule,tokens));
 }
 const rows=[];
 const add=(label,basis,rate,reduced)=>{
  if(!(Number(rate)>0))throw error(`Complete the approved ${label} rate before preparing this NLU agreement.`);
  rows.push(`<tr><th>${escape(label)}</th><td>${escape(basis)}</td><td>${dollars(rate)}</td><td>${reduced==null?'—':dollars(reduced)}</td></tr>`);
 };
 if(roles.includes('psychotherapy'))add('Clinical Session Rate','per approved credit',profile.creditRate,profile.creditRateProbation);
 if(roles.some(r=>['bachelors_counseling','psychotherapy'].includes(r)))add('General Direct Care','per direct-hour equivalent',profile.hcodeRate,profile.hcodeRateProbation);
 add('Indirect work','per actual hour',profile.indirectRate);
 add('Support activities','per actual hour',profile.supportActivityRate);
 if(roles.includes('tutoring')) {
  const tutoringLevel=Number(tokens.TUTORING_LEVEL??details.tutoring?.payLevel??level);
  const rawApproved=tokens.TUTORING_HOURLY_RATE??details.tutoring?.hourlyRate;
  const approved=rawApproved==null||rawApproved===''?null:Number(rawApproved);
  const virtual=nluTutoringRate({category,level:tutoringLevel,format:'virtual',individualHourlyRate:approved});
  const inPerson=nluTutoringRate({category,level:tutoringLevel,format:'in_person',individualHourlyRate:approved});
  const virtualProbation=category>=3&&!schedule.probationWaived?Math.round(virtual*85)/100:virtual;
  const inPersonProbation=category>=3&&!schedule.probationWaived?Math.round(inPerson*85)/100:inPerson;
  add('Tutoring — virtual','per actual hour',virtual,category>=3?virtualProbation:null);
  add('Tutoring — in person','per actual hour',inPerson,category>=3?inPersonProbation:null);
  Object.assign(schedule,{tutoringLevel,tutoringHourlyRate:approved,tutoringVirtualRate:virtual,tutoringInPersonRate:inPerson});
  if(category>=3)schedule.tutoringRateProbation=virtualProbation;
 }
 const childcareLevel=tokens.CHILDCARE_LEVEL??details.childcare?.payLevel;
 const childcareRate=tokens.CHILDCARE_HOURLY_RATE??details.childcare?.hourlyRate;
 if(roles.includes('childcare')&&childcareLevel!=null)schedule.childcareLevel=Number(childcareLevel);
 if(roles.includes('childcare'))schedule.childcareRatesByBand=normalizeChildcareRatesByBand(details.childcare?.ratesByBand);
 if(roles.includes('childcare')&&childcareRate!=null&&childcareRate!=='') {
  if(!(Number(childcareRate)>0))throw error('Confirm the individual childcare hourly rate.');
  schedule.childcareRate=Number(childcareRate);
 }
 const serviceCompensationTerms={};
 if(roles.includes('childcare')) {
  const bands=[1,2,3,4].map(children=>{
   const rate=nluChildcareRate({category,level:schedule.childcareLevel,children,caregivers:1,individualHourlyRate:schedule.childcareRate,ratesByBand:schedule.childcareRatesByBand}).rate;
   add(`Childcare — ${children} child${children===1?'':'ren'} per active caregiver`,'per actual hour',rate);
   return {children,rate};
  });
  serviceCompensationTerms.childcare=`Category ${category}, approved childcare Level ${schedule.childcareLevel}. ${bands.map(({children,rate})=>`${children} child${children===1?'':'ren'} per active caregiver: ${dollars(rate)}/hour`).join('; ')}. For shared groups, divide actual children by actively assigned caregivers and round up to choose the compensation band; calculate separate groups separately. Required preparation, cleanup and on-duty availability with no children present use the one-child rate of ${dollars(bands[0].rate)}/hour. Childcare has no automatic indirect allowance. More than four children per caregiver requires staffing review; do not extrapolate a pay band. These compensation bands do not establish permitted staffing ratios.`;
 }
 if(roles.includes('psychological_testing')) {
  schedule.serviceRoles=[...roles];
  schedule.testingServicePolicyVersion=TESTING_SERVICE_POLICY_VERSION;
  add('Authorized testing administration/scoring','per actual hour',profile.hcodeRate,profile.hcodeRateProbation);
  add('Separately authorized testing evaluation','per actual hour',profile.creditRate);
  schedule.testingEvaluationRate=profile.creditRate;
  schedule.testingAdministrationRate=profile.hcodeRate;
  schedule.testingAdministrationRateProbation=profile.hcodeRateProbation;
  schedule.testingAuthorizationReference=details.psychological_testing?.authorizationTerms||'';
  schedule.testingAuthorized=!!schedule.testingAuthorizationReference;
  serviceCompensationTerms.psychological_testing=testingCompensationSchedule(schedule);
 }
 const programHtml=category>1?`<h3>Separate program rates, when assigned and authorized</h3><p>Homework Help: ${dollars(schedule.homeworkHelpRate)}/hour-equivalent; applicable program probation ${dollars(schedule.homeworkHelpRateProbation)}. Eligible H2014: ${dollars(schedule.h2014Rate)}/hour-equivalent; applicable program probation ${dollars(schedule.h2014RateProbation)}. These program rows retain their own service mappings and new-hire terms, using the former Category ${category-1} schedule under the new numbering. Categories 3 and 4 receive 85% of the approved program base during applicable first-60-day new-hire probation unless waived; Category 2 keeps the full applicable program rate. General minimum-workload reductions and clinical additions do not apply to these program rows. Category 1 does not provide H2014. Tutoring follows its separate documented placement and format rates above. A listing does not authorize a service or claim.</p>`:'';
 let compensation=`<h2>NLU individual compensation · Category ${category}, Level ${level}</h2><p>This prospective schedule identifies the selected duties and rates for this appointment. Policy version ${NLU_COMPENSATION_POLICY_VERSION}. Compensation placement does not authorize a service or establish licensure, supervision or payer eligibility. Existing individual rates and earned compensation are preserved except where the completed agreement expressly replaces them.</p>${exceptionHtml}<table><thead><tr><th>Pay type</th><th>Basis</th><th>Regular rate</th><th>Applicable reduced rate</th></tr></thead><tbody>${rows.join('')}</tbody></table>${roles.includes('childcare')?'<p>The childcare clause below includes the approved childcare level, one-child base and child-count/shared-caregiver bands from this schedule. Additional individual terms are included when entered. Do not substitute a clinical category rate for childcare. Childcare has no automatic indirect allowance.</p>':''}${programHtml}<p>Approved tutoring, general Direct Care and testing administration receive 10 paid indirect minutes per direct-hour equivalent at the applicable indirect rate, prorated. Authorized testing evaluation pays actual evaluation/report/feedback time at its separate hourly rate without an automatic indirect supplement. Record additional actual required work without duplicate compensation. Claim units and reimbursement do not determine paid work time.</p><p>Clinical/general Direct Care introductory and workload rules remain those expressly disclosed in this schedule and the effective handbook; a later amendment or renumbering does not restart probation. Program-specific terms apply only to the corresponding approved service. Existing employee waivers remain intact.</p>${nluCategoryDefinitionsHtml()}${WAGE_FLOOR_HTML}`;
 if(schedule.newHireTermsVersion)compensation=compensation.replace('<th>Applicable reduced rate</th>',`<th>${schedule.probationApplies?'Selected probation rate':'Probation not applied'}</th>`).replace(/<p>Clinical\/general Direct Care introductory and workload rules[\s\S]*?<\/p>/,contractProbationHtml(schedule,tokens));
 const benefits='<h2>Benefits and protected leave</h2><p>Benefit eligibility follows the effective NLU handbook, individual agreement and applicable plan documents. Category and pay level are distinct from workload/benefit tiers. Preserve existing accrued leave and earned rights. Record all actual compensable work and reconcile accrual with applicable sick-leave requirements. No new probationary waiting period applies to protected sick leave. Any service-credit equivalency is an accrual calculation, not extra cash pay or permission to omit actual work time.</p>';
 return {compensation,benefits,legal,schedule,serviceCompensationTerms,version:NLU_COMPENSATION_POLICY_VERSION};
}
