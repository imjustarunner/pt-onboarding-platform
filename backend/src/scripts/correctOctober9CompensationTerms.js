/** Owner's Oct 9 corrections. Update unsigned drafts and saved setup, never send or activate payroll. */
import fs from 'node:fs';
import pool from '../config/database.js';
import {itscoSuggestedTopicEdits} from '../content/itscoOctober2026SuggestedEdits.js';
import {renderAmendment,commonAmendmentClauses,handbookSections} from '../content/itscoOctober2026Drafts.js';
import {addLevelExpectationsToClauses,LEVEL_EXPECTATIONS_VERSION} from '../content/compensationLevelExpectations.js';
import {SICK_LEAVE_RATE_POLICY,ACTIVITY_CLASSIFICATION_POLICY,CONDITIONAL_ADDITION_POLICY} from '../content/compensationSchedulePresentation.js';
import {highestEligibleSickRate,SICK_RATE_MODE} from '../services/sickLeaveRate.service.js';
import {HANDBOOK_ADDITION_MODE} from '../services/conditionalAdditionPolicy.service.js';
const apply=process.argv.includes('--apply'),parse=v=>typeof v==='string'?JSON.parse(v):v;
const attachments=html=>(String(html||'').match(/<figure\b[^>]*>[\s\S]*?<\/figure>|<video\b[^>]*>[\s\S]*?<\/video>|<img\b[^>]*data-training-key=[^>]*>/gi)||[]).join('');
export function reviseSharedClauses(html){return addLevelExpectationsToClauses(html)
 .replaceAll('sick-leave/PTO','sick-leave').replaceAll('Sick-leave/PTO','Sick-leave')
 .replace('Leave is paid at the stated PTO rate or a higher rate required by law.',SICK_LEAVE_RATE_POLICY)
 .replace('Required onboarding, Provider Update reading/listening, training, meetings, compensable supervision and designated support work are paid at the applicable support activity rate.',ACTIVITY_CLASSIFICATION_POLICY+' Required Provider Update review is a designated support activity.');}
const db=await pool.getConnection();
try{
 await db.beginTransaction();
 const [drafts]=await db.execute("SELECT * FROM contract_generations WHERE agency_id=2 AND task_id IS NULL AND user_specific_document_id IS NULL AND JSON_UNQUOTE(JSON_EXTRACT(token_values_json,'$.draftKind'))='provider_update_compensation' FOR UPDATE");
 const [assignments]=await db.execute('SELECT * FROM payroll_user_compensation_levels WHERE agency_id=2 FOR UPDATE');
 const [pto]=await db.execute('SELECT * FROM payroll_pto_accounts WHERE agency_id=2 FOR UPDATE');
 const [rates]=await db.execute('SELECT * FROM payroll_pay_system_rates WHERE agency_id=2');
 const [people]=await db.execute('SELECT id,credential,title,role FROM users WHERE id IN (SELECT user_id FROM user_agencies WHERE agency_id=2 AND is_active=1)');
 const [history]=await db.execute("SELECT s.user_id,s.breakdown,s.grace_active,p.period_end FROM payroll_summaries s JOIN payroll_periods p ON p.id=s.payroll_period_id WHERE s.agency_id=2 AND p.status IN ('posted','finalized') ORDER BY p.period_end DESC,s.id DESC");
 const [[agency]]=await db.execute('SELECT tier_thresholds_json FROM agencies WHERE id=2');
 const [topics]=await db.execute("SELECT t.*,u.agency_id FROM admin_update_topics t JOIN admin_updates u ON u.id=t.update_id WHERE u.id IN (1,2) AND u.status='draft' AND t.topic_key='business_cards' FOR UPDATE");
 const [sections]=await db.execute('SELECT s.* FROM workplace_handbook_sections s JOIN workplace_handbook_versions v ON v.id=s.version_id WHERE v.agency_id=2 AND v.is_draft=1 FOR UPDATE');
 const [entries]=await db.execute("SELECT e.* FROM workplace_handbook_digest_entries e JOIN workplace_handbook_digests d ON d.id=e.digest_id WHERE d.agency_id=2 AND d.status='draft' FOR UPDATE");
 const [clauses]=await db.execute("SELECT * FROM contract_clauses WHERE agency_id=2 AND clause_key='OCT26_COMPENSATION_AMENDMENT' AND is_active=0 FOR UPDATE");
 const [bonusPolicies]=await db.execute('SELECT * FROM payroll_conditional_addition_policies WHERE agency_id=2');
 if(apply){if(!process.env.UPDATE_BACKUP_PATH)throw new Error('An exclusive backup path is required.');fs.writeFileSync(process.env.UPDATE_BACKUP_PATH,JSON.stringify({drafts,assignments,pto,topics,sections,entries,clauses,bonusPolicies},null,2),{mode:0o600,flag:'wx'});}
 const report=[];
 for(const row of drafts){const data=parse(row.token_values_json),s=data.schedule||{},uid=Number(row.candidate_user_id),a=assignments.find(x=>x.user_id===uid),u=people.find(x=>x.id===uid);
  data.commonClausesHtml=reviseSharedClauses(data.commonClausesHtml||commonAmendmentClauses('sick'));data.leaveChoice='sick';data.levelExpectationsPolicyVersion=LEVEL_EXPECTATIONS_VERSION;s.probationWaived=true;data.conditionalAdditionMode=HANDBOOK_ADDITION_MODE;data.sickLeaveRateMode=SICK_RATE_MODE;
  s.tier3MinWeekly=Number(parse(agency.tier_thresholds_json)?.tier3MinWeekly??25);
  const rate=rates.find(r=>r.category===Number(s.category)&&r.level===Number(s.level));
  if(rate){const tier=parse(history.find(x=>x.user_id===uid)?.breakdown)?.__tier;const bonus=Number(parse(rate.tier_bonus_json)?.[3]??0);s.tier3LevelBonus=bonus;
   s.clinicalEligible=Number(s.category)!==1||/intern|master|\bMA\b|\bMS\b|\bMSW\b/i.test([u?.title,u?.role,u?.credential].join(' '));
   const status={tierLevel:Number(tier?.tierLevel||0),currentTierLevel:history.find(x=>x.user_id===uid)?.grace_active?0:Number(tier?.tierLevel||0),spanishBonusEligible:!!a?.spanish_bonus_eligible,locationBonusEligible:!!a?.location_bonus_eligible,useReducedRates:false};
   // The new matrix is not activated. Seed its regular starting rate; the signed policy resolves MWR for leave dates after its 60-day waiver.
   if(a?.pay_system_enabled)throw new Error('Review activated payroll before reseeding rates.');
   const profile={category:s.category,level:s.level,creditRate:s.creditRate,hcodeRate:s.hcodeRate,indirectRate:s.indirectRate,supportActivityRate:s.supportRate,tierBonusFfs:{1:0,2:0,3:bonus},tierBonusHcode:{1:0,2:0,3:Number(s.category)===1?bonus:0},spanishBonus:parse(rate.spanish_bonus_json),locationBonus:parse(rate.location_bonus_json),compensationPolicyVersion:data.compensationPolicyVersion};
   s.ptoRate=highestEligibleSickRate({rateProfile:profile,status,clinicalEligible:s.clinicalEligible});s.sickLeaveRateAsOf='2026-10-09';s.sickLeaveRateSource='Approved category/level clinical per-credit or direct hourly base rate; excluding Tier 3 additions and other bonuses or differentials. Minimum-workload reduction waived for first 60 days after the amendment takes effect.';
   if(apply&&pto.some(x=>x.user_id===uid)&&pto.find(x=>x.user_id===uid).employment_type!=='salaried')await db.execute('UPDATE payroll_pto_accounts SET pto_pay_rate=?,updated_by_user_id=501 WHERE agency_id=2 AND user_id=?',[s.ptoRate,uid]);
  }
  data.schedule=s;
  const html=renderAmendment(data);
  if(/Weekly paid indirect|4 hours per week|probation/i.test(html))throw new Error(`Stale weekly/probation wording for ${uid}`);
  if(apply){await db.execute('UPDATE contract_generations SET token_values_json=?,rendered_html=? WHERE id=? AND task_id IS NULL AND user_specific_document_id IS NULL',[JSON.stringify(data),html,row.id]);if(a)await db.execute('UPDATE payroll_user_compensation_levels SET waive_probation=1,probation_ended_on=NULL WHERE agency_id=2 AND user_id=?',[uid]);}
  report.push({id:uid,name:data.employee.name,rate:s.ptoRate??null,category:s.category,level:s.level});
  if(process.env.AMENDMENT_REVIEW_DIR&&[465,82,480,8].includes(uid))fs.writeFileSync(`${process.env.AMENDMENT_REVIEW_DIR}/${data.employee.name.replace(/[^a-zA-Z0-9]+/g,'-')}-amendment.html`,`<!doctype html><meta charset="utf-8"><style>body{font:16px/1.6 system-ui;max-width:1300px;margin:30px auto;padding:20px;color:#173346}table{border-collapse:collapse;width:100%}th,td{padding:10px;border:1px solid #ccd6df;text-align:left}thead th{background:#173346;color:white}</style>${html}`,{mode:0o600});
 }
 for(const rate of rates){if(bonusPolicies.some(p=>p.category===rate.category&&p.level===rate.level))continue;const bonus=Number(parse(rate.tier_bonus_json)?.[3]??0);if(apply)await db.execute('INSERT INTO payroll_conditional_addition_policies(agency_id,category,level,effective_on,clinical_addition,hcode_addition,created_by_user_id) VALUES (2,?,?,\'2026-10-10\',?,?,501)',[rate.category,rate.level,bonus,rate.category===1?bonus:0]);}
 for(const topic of topics){let body=itscoSuggestedTopicEdits.business_cards.body;if(topic.agency_id===6)body=body.replaceAll('ITSCO','NLU').replaceAll('itsco.health','nextleveluplcc.com');body+=attachments(topic.body_html);if(apply)await db.execute('UPDATE admin_update_topics SET body_html=? WHERE id=?',[body,topic.id]);}
 const generated=handbookSections({rates});const slugs=['compensation-level-expectations-and-review','paid-time-off-and-colorado-sick-leave','timekeeping-support-and-overtime','october-2026-editor-change-map'];
 for(const section of sections){const source=generated.find(s=>s.slug===section.slug);if(!source||!slugs.includes(section.slug))continue;const body=source.bodyHtml+attachments(section.body_html);if(apply)await db.execute('UPDATE workplace_handbook_sections SET title=?,body_html=? WHERE id=?',[source.title,body,section.id]);for(const entry of entries.filter(e=>e.subject===section.title)){if(apply)await db.execute('UPDATE workplace_handbook_digest_entries SET subject=?,changed_content=?,rationale=? WHERE id=?',[source.title,body,'Clarify annual paid event participation, current sick-leave rates, activity classifications and prospective compensation policies.',entry.id]);}}
 // Keep the editable rate schedule; add the current Tier 3 threshold and prospective-change rule once.
 const marker='<h3>Conditional Tier 3 additions</h3>';const addition=marker+`<p>Tier 3 currently requires ${Number(parse(agency.tier_thresholds_json)?.tier3MinWeekly??25)*2} qualifying session credits per two-week pay period. Current-period session credits determine this addition; retained benefit tiers during grace do not qualify.</p><p>${CONDITIONAL_ADDITION_POLICY}</p><p>Record changes in the app’s pay-system rate settings with their prospective effective date and give staff notice. Changing handbook prose alone does not recalculate payroll.</p>`;
 for(const section of sections.filter(s=>s.slug==='category-level-rate-schedule'&&!s.body_html.includes(marker))){if(apply)await db.execute('UPDATE workplace_handbook_sections SET body_html=? WHERE id=?',[section.body_html+addition,section.id]);for(const entry of entries.filter(e=>e.subject===section.title)){if(apply)await db.execute('UPDATE workplace_handbook_digest_entries SET changed_content=? WHERE id=?',[entry.changed_content+addition,entry.id]);}}
 for(const clause of clauses){if(apply)await db.execute('UPDATE contract_clauses SET body_html=? WHERE id=?',[reviseSharedClauses(clause.body_html),clause.id]);}
 if(apply)await db.commit();else await db.rollback();
 console.log(JSON.stringify({mode:apply?'saved':'dry-run',drafts:report.length,rates:report,bonusPolicies:rates.length,emailsSent:0,payrollActivated:false}));
}catch(e){await db.rollback();throw e;}finally{db.release();await pool.end();}
