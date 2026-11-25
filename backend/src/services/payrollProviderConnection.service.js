import crypto from 'node:crypto';
import pool from '../config/database.js';

const day=value=>value instanceof Date?value.toISOString().slice(0,10):String(value||'').slice(0,10);
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
const employeeRoles=new Set(['provider','provider_plus','intern','intern_plus','staff','supervisor','admin','support','clinical_practice_assistant']);
const ids=value=>Number.isInteger(Number(value))&&Number(value)>0;

async function context({agencyId,periodId},db,lock=false){
 const [[period]]=await db.execute('SELECT * FROM payroll_periods WHERE id=? AND agency_id=?'+(lock?' FOR UPDATE':''),[periodId,agencyId]);
 if(!period)fail('Payroll period not found.',404);
 if(['posted','finalized'].includes(String(period.status).toLowerCase())||period.posted_at||period.finalized_at||period.posted_by_user_id||period.finalized_by_user_id)fail('Choose an open payroll period. Posted payroll stays unchanged.');
 const [prior]=await db.execute('SELECT id FROM payroll_periods WHERE agency_id=? AND period_end<? ORDER BY period_end DESC,id DESC LIMIT 2',[agencyId,day(period.period_start)]);
 const periodIds=[Number(period.id),...prior.map(p=>Number(p.id))];
 const [imports]=await db.execute(`SELECT id,payroll_period_id,slot_number FROM payroll_imports WHERE agency_id=? AND payroll_period_id IN (${periodIds.map(()=>'?').join(',')}) ORDER BY id DESC`,[agencyId,...periodIds]);
 const scopes=periodIds.map((id,index)=>imports.find(i=>Number(i.payroll_period_id)===id&&Number(i.slot_number||1)===index+1)).filter(Boolean);
 if(!scopes.some(i=>Number(i.payroll_period_id)===Number(period.id)))fail('Upload the current Run 1 report before connecting a provider.');
 return{period,scopes};
}
async function candidates(agencyId,db){
 const [users]=await db.execute(`SELECT u.id,u.first_name,u.last_name,u.role,u.status,u.is_archived,COALESCE(u.is_assistant_account,0) is_assistant_account
  FROM users u JOIN user_agencies ua ON ua.user_id=u.id WHERE ua.agency_id=? ORDER BY u.last_name,u.first_name,u.id`,[agencyId]);
 return users.filter(u=>employeeRoles.has(u.role)&&!Number(u.is_assistant_account)).map(u=>({id:Number(u.id),name:[u.first_name,u.last_name].filter(Boolean).join(' '),archived:!!Number(u.is_archived)||String(u.status).toUpperCase()==='ARCHIVED'}));
}
async function assertNoSourcePay({agencyId,periodId,sourceUserIds,targetUserId},db){
 if(sourceUserIds.length){
 const placeholders=sourceUserIds.map(()=>'?').join(',');
 const [paid]=await db.execute(`SELECT user_id,total_amount FROM payroll_summaries WHERE agency_id=? AND payroll_period_id=? AND user_id IN (${placeholders})`,[agencyId,periodId,...sourceUserIds]);
 if(paid.some(s=>Number(s.total_amount)!==0))fail('The current source profile already has calculated pay. Reconcile its pay before connecting it.');
 }
 const allIds=[...new Set([...sourceUserIds,targetUserId])],params=[agencyId,periodId,...allIds],clause=`agency_id=? AND payroll_period_id=? AND user_id IN (${allIds.map(()=>'?').join(',')})`;
 for(const table of ['payroll_manual_pay_lines','payroll_stage_carryovers','payroll_staging_overrides']){
  const [rows]=await db.execute(`SELECT user_id FROM ${table} WHERE ${clause} LIMIT 1`,params);
  if(rows.length)fail('Review existing manual pay, catch-up entries or staging overrides for these profiles before connecting them.');
 }
 const [adjustments]=await db.execute(`SELECT * FROM payroll_adjustments WHERE ${clause}`,params);
 if(adjustments.some(row=>Object.entries(row).some(([key,value])=>(key.endsWith('_amount')||key.endsWith('_hours'))&&Number(value)!==0&&Number.isFinite(Number(value)))))fail('Review existing payroll adjustments for these profiles before connecting them.');
}

export async function previewPayrollProviderConnection({agencyId,periodId,providerName=null,targetUserId=null},db=pool,{lock=false}={}){
 const ctx=await context({agencyId,periodId},db,lock);
 if(!providerName&&!targetUserId){
  const current=ctx.scopes.find(i=>Number(i.payroll_period_id)===Number(periodId));
  const [rows]=await db.execute('SELECT provider_name,COUNT(*) row_count FROM payroll_import_rows WHERE agency_id=? AND payroll_import_id=? GROUP BY provider_name ORDER BY provider_name',[agencyId,current.id]);
  return{providers:rows.filter(r=>r.provider_name).map(r=>({name:r.provider_name,rowCount:Number(r.row_count)})),candidates:await candidates(agencyId,db)};
 }
 if(typeof providerName!=='string'||!providerName.trim()||providerName.length>255||!ids(targetUserId))fail('Choose the report provider and an existing payroll profile.',400);
 const target=(await candidates(agencyId,db)).find(u=>u.id===Number(targetUserId));
 if(!target)fail('Choose an employee profile already belonging to this agency.',403);
 const importIds=ctx.scopes.map(i=>Number(i.id));
 const [rows]=await db.execute(`SELECT id,payroll_import_id,payroll_period_id,user_id,service_code,service_date,unit_count,note_status,draft_payable,row_fingerprint
  FROM payroll_import_rows WHERE agency_id=? AND payroll_import_id IN (${importIds.map(()=>'?').join(',')}) AND provider_name=? ORDER BY id`+(lock?' FOR UPDATE':''),[agencyId,...importIds,providerName]);
 if(!rows.some(r=>Number(r.payroll_period_id)===Number(periodId)))fail('This provider is not in the selected current report. Refresh the connection review.');
 const changes=rows.filter(r=>Number(r.user_id||0)!==target.id);
 const sourceUserIds=[...new Set(changes.map(r=>Number(r.user_id||0)).filter(Boolean))];
 if(sourceUserIds.length>1)fail('This report name belongs to multiple payroll profiles. Review the source rows before connecting it.');
 await assertNoSourcePay({agencyId,periodId,sourceUserIds,targetUserId:target.id},db);
 const review={providerName,target,changedRows:changes.length,currentRows:changes.filter(r=>Number(r.payroll_period_id)===Number(periodId)).length,catchupRows:changes.filter(r=>Number(r.payroll_period_id)!==Number(periodId)).length};
 review.reviewToken=crypto.createHash('sha256').update(JSON.stringify({agencyId:Number(agencyId),periodId:Number(periodId),period:ctx.period,scopes:ctx.scopes,target,providerName,rows})).digest('hex');
 return{...review,...(lock?{changes,importIds}:{})};
}

export async function connectPayrollProvider({agencyId,periodId,providerName,targetUserId,reviewToken,confirmedSamePerson,actorUserId},getConnection=()=>pool.getConnection()){
 if(confirmedSamePerson!==true)fail('Confirm these report services belong to the selected employee.',400);
 if(!ids(actorUserId))fail('A signed-in payroll reviewer is required.',403);
 const db=await getConnection();
 try{
  await db.beginTransaction();
  const review=await previewPayrollProviderConnection({agencyId,periodId,providerName,targetUserId},db,{lock:true});
  if(!reviewToken||reviewToken!==review.reviewToken)fail('The report or payroll changed. Refresh this review before connecting it.');
  if(!review.changedRows)fail('These services already use the selected payroll profile.');
  for(const row of review.changes){
   await db.execute('INSERT INTO payroll_import_row_audit (payroll_import_row_id,payroll_import_id,payroll_period_id,agency_id,field_changed,from_value,to_value,changed_by_user_id) VALUES (?,?,?,?,?,?,?,?)',
    [row.id,row.payroll_import_id,row.payroll_period_id,agencyId,'provider_connection',JSON.stringify({userId:row.user_id||null}),JSON.stringify({userId:Number(targetUserId),providerName,confirmedSamePerson:true,approvedInPayrollPeriodId:Number(periodId),targetArchived:review.target.archived}),Number(actorUserId)]);
   const [result]=await db.execute('UPDATE payroll_import_rows SET user_id=? WHERE id=? AND agency_id=? AND payroll_import_id=?',[Number(targetUserId),row.id,agencyId,row.payroll_import_id]);
   if(Number(result.affectedRows)!==1)fail('A source row changed. Refresh before connecting it.');
  }
  await db.execute('DELETE FROM payroll_summaries WHERE payroll_period_id=? AND agency_id=?',[periodId,agencyId]);
  await db.execute("UPDATE payroll_periods SET status='staged',ran_at=NULL,ran_by_user_id=NULL WHERE id=? AND agency_id=?",[periodId,agencyId]);
  await db.commit();return{connected:true,changedRows:review.changedRows,currentRows:review.currentRows,catchupRows:review.catchupRows,requiresRerun:true,target:review.target};
 }catch(error){await db.rollback();throw error;}finally{db.release();}
}
