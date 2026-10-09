/** Owner clarification: base clinical/direct rates only. Unsigned drafts only. */
import fs from 'node:fs';
import pool from '../config/database.js';
import {renderAmendment} from '../content/itscoOctober2026Drafts.js';
import {SICK_LEAVE_RATE_POLICY} from '../content/compensationSchedulePresentation.js';
import {highestEligibleSickRate} from '../services/sickLeaveRate.service.js';
const apply=process.argv.includes('--apply'),parse=v=>typeof v==='string'?JSON.parse(v):v;
const previous='Paid sick leave uses the highest pay rate for work you are currently eligible to perform, including applicable earned Tier 3 additions and pay differentials. When minimum-workload rates apply, the eligible reduced rate is used. Rates are determined for the leave dates, with applicable waivers and the handbook’s sick-leave calculation rules. This is paid sick leave, not vacation or general PTO.';
const revise=text=>String(text||'').replaceAll(previous,SICK_LEAVE_RATE_POLICY).replaceAll('including applicable pay differentials and any required variable-pay calculation','using the currently applicable clinical per-credit or direct hourly base rate, excluding Tier 3 additions and other bonuses or differentials').replaceAll('with probation/minimum-workload status and earned additions reflected','with applicable minimum-workload status reflected, excluding Tier 3 additions and other bonuses or differentials');
const db=await pool.getConnection();
try{
 await db.beginTransaction();
 const [drafts]=await db.execute("SELECT * FROM contract_generations WHERE agency_id IN (2,6) AND task_id IS NULL AND user_specific_document_id IS NULL AND JSON_UNQUOTE(JSON_EXTRACT(token_values_json,'$.draftKind'))='provider_update_compensation' FOR UPDATE");
 const [accounts]=await db.execute('SELECT * FROM payroll_pto_accounts WHERE agency_id IN (2,6) FOR UPDATE');
 const [assignments]=await db.execute('SELECT * FROM payroll_user_compensation_levels WHERE agency_id IN (2,6)');
 const [sections]=await db.execute('SELECT s.* FROM workplace_handbook_sections s JOIN workplace_handbook_versions v ON v.id=s.version_id WHERE v.agency_id IN (2,6) AND v.is_draft=1 FOR UPDATE');
 const [entries]=await db.execute("SELECT e.* FROM workplace_handbook_digest_entries e JOIN workplace_handbook_digests d ON d.id=e.digest_id WHERE d.agency_id IN (2,6) AND d.status='draft' FOR UPDATE");
 const [clauses]=await db.execute("SELECT * FROM contract_clauses WHERE agency_id IN (2,6) AND clause_key='OCT26_COMPENSATION_AMENDMENT' AND is_active=0 FOR UPDATE");
 if(apply){if(!process.env.UPDATE_BACKUP_PATH)throw Error('UPDATE_BACKUP_PATH required');fs.writeFileSync(process.env.UPDATE_BACKUP_PATH,JSON.stringify({drafts,accounts,sections,entries,clauses}),{mode:0o600,flag:'wx'});}
 const report={applied:apply,drafts:0,rateChanges:[],handbook:0,digest:0,clauses:0};
 for(const row of drafts){const data=parse(row.token_values_json),s=data.schedule;if(!s?.category||!s?.level)continue;
  const assignment=assignments.find(a=>a.agency_id===row.agency_id&&a.user_id===row.candidate_user_id);
  if(assignment?.pay_system_enabled)throw Error(`Review active payroll before changing draft ${row.id}`);
  const old=s.ptoRate;
  // Preserve the explicit remaining new-hire probation state in saved drafts;
  // all other existing staff have their 60-day minimum-workload waiver.
  const reduced=!s.probationWaived && Number(old)===Math.max(s.clinicalEligible!==false?Number(s.creditRateProbation)||0:0,Number(s.hcodeRateProbation)||0);
  s.ptoRate=highestEligibleSickRate({rateProfile:s,status:{useReducedRates:reduced},clinicalEligible:s.clinicalEligible});
  s.sickLeaveRateSource='Current clinical per-credit or direct hourly base rate only; Tier 3 additions, other bonuses, differentials and supervision pay excluded. Applicable reduced rates and waivers are determined for the leave dates.';
  data.commonClausesHtml=revise(data.commonClausesHtml);
  const html=renderAmendment(data);
  if(apply)await db.execute('UPDATE contract_generations SET token_values_json=?,rendered_html=? WHERE id=? AND task_id IS NULL AND user_specific_document_id IS NULL',[JSON.stringify(data),html,row.id]);
  if(Number(old)!==s.ptoRate){report.rateChanges.push({id:row.candidate_user_id,from:old,to:s.ptoRate});const account=accounts.find(a=>a.agency_id===row.agency_id&&a.user_id===row.candidate_user_id);if(account&&account.employment_type!=='salaried'&&Number(account.pto_pay_rate)===Number(old)&&apply)await db.execute('UPDATE payroll_pto_accounts SET pto_pay_rate=? WHERE agency_id=? AND user_id=?',[s.ptoRate,row.agency_id,row.candidate_user_id]);}
  report.drafts++;
 }
 for(const [rows,table,column,key] of [[sections,'workplace_handbook_sections','body_html','handbook'],[entries,'workplace_handbook_digest_entries','changed_content','digest'],[clauses,'contract_clauses','body_html','clauses']])for(const row of rows){const old=row[column],next=revise(old);if(!old||old===next)continue;if(apply)await db.execute(`UPDATE ${table} SET ${column}=? WHERE id=?`,[next,row.id]);report[key]++;}
 if(apply)await db.commit();else await db.rollback();console.log(JSON.stringify(report));
}catch(e){await db.rollback();throw e;}finally{db.release();await pool.end();}
process.exit(0);
