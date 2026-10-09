/** Owner-confirmed corrections: staged pay setup and unsigned drafts only. */
import fs from 'node:fs';
import path from 'node:path';
import pool from '../config/database.js';
import {fillSavedCompensationInputs} from '../services/compensationDraftInputs.js';
import {highestEligibleSickRate} from '../services/sickLeaveRate.service.js';
import {staffMilestones} from '../services/staffMilestonePresentation.service.js';
import {EXEMPT_DRAFT_KIND} from '../services/compensationAmendmentExemption.service.js';
import {renderAmendment,amendmentIssues,escapeHtml} from '../content/itscoOctober2026Drafts.js';
const confirmed=[
 [776,'Danica Alter',1,2],[1147,'Eden Olsen Edwards',1,1],[485,'Jacquelyne Fernandez',1,5],
 [979,'Lily Finch',1,1],[506,'Pauline Boyd',3,4],[1157,'Ryn Pantoya',1,1],
 [1249,'Paige Reilly',2,2],[1185,'Paige Tayloe',1,1]
];
const exclusions=[
 [193,'Elizabeth Rosas','Deferred by owner; retain the existing individual agreement pending separate review.'],
 [559,'Hannah Inyart','Salaried, non-care role; no provider compensation amendment required.'],
 [555,'Loriana Pincente','Salaried, non-care role; no provider compensation amendment required.'],
 [538,'Melissa Mendez','Does not provide care for ITSCO; no provider compensation amendment required.'],
 [507,'Rachel Finch','Owner confirmed no amendment is required.'],
 [501,'Michael Mendez','Owner confirmed no amendment is required.']
];
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const apply=process.argv.includes('--apply'),effectiveOn='2026-10-10';
const staff=await staffMilestones(2),db=await pool.getConnection();
try{
 await db.beginTransaction();
 const [assignments]=await db.execute('SELECT * FROM payroll_user_compensation_levels WHERE agency_id=2 FOR UPDATE');
 const [drafts]=await db.execute("SELECT * FROM contract_generations WHERE agency_id=2 AND JSON_UNQUOTE(JSON_EXTRACT(token_values_json,'$.draftKind')) LIKE 'provider_update_compensation%' FOR UPDATE");
 const [rates]=await db.execute('SELECT * FROM payroll_pay_system_rates WHERE agency_id=2');
 const [dates]=await db.execute("SELECT v.id,v.user_id,d.field_key,v.value FROM user_info_values v JOIN user_info_field_definitions d ON d.id=v.field_definition_id WHERE d.field_key IN ('employment_agreement_date','start_date') ORDER BY v.updated_at DESC,v.id DESC");
 const [history]=await db.execute("SELECT s.user_id,s.breakdown,s.grace_active FROM payroll_summaries s JOIN payroll_periods p ON p.id=s.payroll_period_id WHERE s.agency_id=2 AND p.status IN ('posted','finalized') ORDER BY p.period_end DESC,s.id DESC");
 const plans=[],skips=[];
 const identify=(id,name)=>{const person=staff.find(p=>p.id===id);if(!person||`${person.first_name} ${person.last_name}`!==name)throw Error(`Identity mismatch: ${id}`);return person;};
 for(const [id,name,category,level] of confirmed){
  const person=identify(id,name),a=assignments.find(a=>a.user_id===id),rows=drafts.filter(d=>d.candidate_user_id===id);
  if(a?.pay_system_enabled)throw Error(`Active pay system needs a dated rate-change review: ${name}`);
  if(rows.length!==1||rows.some(d=>d.task_id||d.user_specific_document_id))throw Error(`Expected one unissued draft: ${name}`);
  const row=rows[0],rate=rates.find(r=>r.category===category&&r.level===level);if(!rate)throw Error(`Missing approved matrix: ${name}`);
  let data=parse(row.token_values_json);data.draftKind='provider_update_compensation';delete data.exemptionReason;delete data.exemptedAt;
  const originalEmployment=data.employee.employmentType;
  const intern=/\bintern\b/i.test(person.title||'');
  data.employee={...data.employee,title:person.title,credential:person.credential||'',employmentType:intern?'intern':'fee_for_service',...(intern?{paidInternConfirmed:true,paidInternConfirmedOn:'2026-10-09'}:{})};
  if(id===485){data.employee.previousEmploymentType=data.employee.previousEmploymentType||originalEmployment;data.employmentTypeEffectiveOn=effectiveOn;data.employee.originalAgreementDate='2026-09-12';}
  data.compensationBasis='service_credit';data.effectiveDate=effectiveOn;
  const location=(person.bases||[]).join(' / ')||person.work_location||'';
  const assignment={...a,user_id:id,category,level,bypass:0,pay_system_enabled:0,waive_probation:id===1147?0:1,
   probation_start_override:id===1147?dates.find(d=>d.user_id===id&&d.field_key==='employment_agreement_date')?.value:(a?.probation_start_override||null),
   spanish_bonus_eligible:Number(a?.spanish_bonus_eligible||0),location_bonus_eligible:/Denver/i.test(location)||id===1249?1:Number(a?.location_bonus_eligible||0),pay_system_effective_start:effectiveOn};
  if(id===1147&&!['2026-08-27','2026-09-12'].includes(assignment.probation_start_override))throw Error('Eden agreement date needs review.');
  const s=data.schedule={...data.schedule,category,level,probationWaived:id!==1147};
  for(const key of ['creditRate','hcodeRate','indirectRate','supportRate','creditRateProbation','hcodeRateProbation','indirectRateProbation','supportRateProbation'])s[key]=null;
  s.clinicalEligible=category!==1||intern||id===1147;
  s.levelDescription=`Level ${level} within Category ${category}. The assigned base rates are listed below. Continued level standing is reviewed one to two times per year using the handbook’s annual paid event-work commitment, timely notes, attendance and clinician cancellations, outreach participation, supervisory evaluations, school and staff feedback, client connection and treatment-goal progress, and school/client action items. Advancement is not automatic; approved changes are prospective.`;
  if(id===1147){s.probationStartDate=assignment.probation_start_override;const end=new Date(`${s.probationStartDate}T00:00:00Z`);end.setUTCDate(end.getUTCDate()+90);s.probationEndDate=end.toISOString().slice(0,10);s.probationEarlyEndTrigger='workload_tier_3';}
  const agreementDate=dates.find(d=>d.user_id===id&&d.field_key==='employment_agreement_date')?.value;
  data=fillSavedCompensationInputs(data,{assignment,rates,agreementDate});
  const schedule=data.schedule,tierRow=history.find(h=>h.user_id===id),tier=parse(tierRow?.breakdown)?.__tier;
  const currentTier=tierRow?.grace_active?Number(tier?.currentTierLevel??tier?.displayTierLevel??0):Number(tier?.tierLevel||0);
  const status={tierLevel:Number(tier?.tierLevel||0),currentTierLevel:currentTier,spanishBonusEligible:!!assignment.spanish_bonus_eligible,locationBonusEligible:!!assignment.location_bonus_eligible,useReducedRates:id===1147&&currentTier<3&&effectiveOn<schedule.probationEndDate};
  const profile={category,level,creditRate:schedule.creditRate,creditRateProbation:schedule.creditRateProbation,hcodeRate:schedule.hcodeRate,hcodeRateProbation:schedule.hcodeRateProbation,indirectRate:schedule.indirectRate,supportActivityRate:schedule.supportRate,tierBonusFfs:{1:0,2:0,3:schedule.tier3LevelBonus},tierBonusHcode:{1:0,2:0,3:category===1?schedule.tier3LevelBonus:0},spanishBonus:parse(rate.spanish_bonus_json),locationBonus:parse(rate.location_bonus_json),compensationPolicyVersion:data.compensationPolicyVersion};
  schedule.ptoRate=highestEligibleSickRate({rateProfile:profile,status,clinicalEligible:schedule.clinicalEligible});
  schedule.sickLeaveRateAsOf=effectiveOn;schedule.sickLeaveRateSource='Approved October 10 assignment and recorded workload tier; remaining new-hire probation applies only where expressly stated. Payroll resolves eligibility for actual leave dates.';
  if(id===506){data.roleCompensation={...data.roleCompensation,supervisor:{hourlyRate:65,groupMultiplier:1.5,noteReviewMultiplier:.5,noteReviewBasis:'actual_other_provider_note_review_hours',sickLeaveBasis:'clinical_service_rate',source:'Owner confirmation October 9, 2026'}};data.additionalTerms=[data.additionalTerms,'Your current assignment is supervision only. Your Category 3, Level 4 designation does not change supervision pay to a clinical service rate. Individual supervision pays $65.00 per hour, group supervision $97.50 per hour, and actual review/cosigning of other providers’ notes $32.50 per hour. Direct-care work requires a separate authorized assignment.'].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join('\n');}
  data.source={...data.source,assignment,rateProfile:rate,ownerConfirmedOn:'2026-10-09',correctionKey:'remaining-amendments-oct9',eligibilitySource:{...data.source?.eligibilitySource,location}};
  plans.push({id,name,row,assignment,data,html:renderAmendment(data)});
 }
 for(const [id,name,reason] of exclusions){identify(id,name);const rows=drafts.filter(d=>d.candidate_user_id===id);if(rows.some(d=>d.task_id||d.user_specific_document_id))throw Error(`Issued document requires separate handling: ${name}`);
  for(const row of rows.length?rows:[null]){const data=row?parse(row.token_values_json):{employee:{userId:id,name}};data.draftKind=EXEMPT_DRAFT_KIND;data.exemptionReason=reason;data.exemptedAt=data.exemptedAt||new Date().toISOString();if([559,555].includes(id))data.employee.employmentType='salaried';skips.push({id,name,row,data,reason});}
 }
 if(apply){if(!process.env.UPDATE_BACKUP_PATH)throw Error('Exclusive backup path required');fs.writeFileSync(process.env.UPDATE_BACKUP_PATH,JSON.stringify({assignments,drafts,dates},null,2),{mode:0o600,flag:'wx'});
  for(const date of dates.filter(d=>d.user_id===485&&d.field_key==='employment_agreement_date'&&d.value==='0026-09-12'))await db.execute('UPDATE user_info_values SET value=? WHERE id=? AND value=?',['2026-09-12',date.id,'0026-09-12']);
  for(const plan of plans){const a=plan.assignment;await db.execute(`INSERT INTO payroll_user_compensation_levels(agency_id,user_id,category,level,bypass,pay_system_enabled,waive_probation,probation_start_override,spanish_bonus_eligible,location_bonus_eligible,pay_system_effective_start,assigned_by_user_id) VALUES(2,?,?,?,0,0,?,?,?,?,?,501) ON DUPLICATE KEY UPDATE category=VALUES(category),level=VALUES(level),bypass=0,waive_probation=VALUES(waive_probation),probation_start_override=VALUES(probation_start_override),spanish_bonus_eligible=VALUES(spanish_bonus_eligible),location_bonus_eligible=VALUES(location_bonus_eligible),pay_system_effective_start=VALUES(pay_system_effective_start),assigned_by_user_id=501,updated_at=CURRENT_TIMESTAMP`,[plan.id,a.category,a.level,a.waive_probation,a.probation_start_override,a.spanish_bonus_eligible,a.location_bonus_eligible,effectiveOn]);
   await db.execute('UPDATE contract_generations SET token_values_json=?,rendered_html=? WHERE id=? AND task_id IS NULL AND user_specific_document_id IS NULL',[JSON.stringify(plan.data),plan.html,plan.row.id]);}
  for(const skip of skips){if(skip.row)await db.execute('UPDATE contract_generations SET token_values_json=? WHERE id=? AND task_id IS NULL AND user_specific_document_id IS NULL',[JSON.stringify(skip.data),skip.row.id]);else await db.execute('INSERT INTO contract_generations(agency_id,candidate_user_id,token_values_json,rendered_html,created_by_user_id) VALUES(2,?,?,?,501)',[skip.id,JSON.stringify(skip.data),`<p>No compensation amendment required: ${escapeHtml(skip.reason)}</p>`]);}
  await db.commit();
 }else await db.rollback();
 const finalDrafts=drafts.filter(d=>!skips.some(s=>s.row?.id===d.id)&&parse(d.token_values_json).draftKind==='provider_update_compensation').map(row=>plans.find(p=>p.row.id===row.id)?.data||parse(row.token_values_json));
 const remaining=finalDrafts.map(data=>({name:data.employee.name,issues:amendmentIssues(data)})).filter(r=>r.issues.length);
 if(apply&&process.env.AMENDMENT_REVIEW_DIR){const dir=process.env.AMENDMENT_REVIEW_DIR;fs.mkdirSync(dir,{recursive:true});
  for(const data of finalDrafts)fs.writeFileSync(path.join(dir,`${data.employee.name.replace(/[^a-zA-Z0-9]+/g,'-')}-amendment.html`),'<!doctype html><meta charset="utf-8"><style>body{font:16px/1.6 system-ui;max-width:1200px;margin:30px auto;padding:20px;color:#173346}table{border-collapse:collapse;width:100%}th,td{padding:10px;border:1px solid #ccd6df;text-align:left}</style>'+renderAmendment(data),{mode:0o600});
  const report=['Remaining amendment review items — October 9, 2026','',remaining.length?remaining.map(r=>r.name+'\n'+r.issues.map(i=>'  '+i).join('\n')).join('\n\n'):'No unresolved draft review items.','','Confirmed assignments (prospective October 10, subject to completed signatures):',...plans.map(p=>`  ${p.name}: Category ${p.assignment.category}, Level ${p.assignment.level}${p.data.employee.employmentType==='intern'?' — paid intern':''}.`),'','Eden: recorded agreement/start date 09-12-2026; first non-probation day 12-11-2026, unless workload Tier 3 or management ends probation earlier. The 60-day minimum-workload waiver is separate.','','Excluded from this amendment rollout:',...exclusions.map(([,name,reason])=>'  '+name+': '+reason),'  Megan Geil-Crader: existing salary exemption retained.','','Pay setup and unsigned drafts updated. Existing salary arrangements and payroll remain in effect until the approved prospective transition. No agreements issued, payroll activated, or messages sent.',''];
  fs.writeFileSync(path.join(dir,'remaining-review-items.txt'),report.join('\n'),{mode:0o600});
 }
 console.log(JSON.stringify({mode:apply?'saved':'dry-run',assignments:plans.map(p=>({id:p.id,name:p.name,category:p.assignment.category,level:p.assignment.level,sickRate:p.data.schedule.ptoRate,probationEnd:p.data.schedule.probationEndDate})),excluded:skips.map(s=>s.name),remaining,payrollActivated:false,messagesSent:0}));
}catch(error){await db.rollback();throw error;}finally{db.release();await pool.end();}
