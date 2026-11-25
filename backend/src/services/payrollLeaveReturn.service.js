import pool from '../config/database.js';
import {LEAVE_BALANCE_COLUMNS,validateLeaveItems} from '../utils/supplementalLeave.js';
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
const locked=p=>['posted','finalized'].includes(String(p?.status).toLowerCase())||p?.posted_at||p?.finalized_at||p?.posted_by_user_id||p?.finalized_by_user_id;

/** Return one unposted approval to pending; append reversals instead of deleting usage history. */
export async function returnApprovedLeaveToPending({agencyId,requestId,actorUserId,expectedHours,confirmed},getConnection=()=>pool.getConnection()){
 if(confirmed!==true)fail('Confirm returning this approved request to pending.',400);
 if(!Number.isInteger(Number(actorUserId))||Number(actorUserId)<=0)fail('A signed-in payroll reviewer is required.',403);
 const db=await getConnection();
 try{
  await db.beginTransaction();
  const [[account]]=await db.execute('SELECT * FROM payroll_pto_accounts WHERE agency_id=? AND user_id=(SELECT user_id FROM payroll_pto_requests WHERE id=? AND agency_id=?) FOR UPDATE',[agencyId,requestId,agencyId]);
  const [[request]]=await db.execute('SELECT * FROM payroll_pto_requests WHERE id=? AND agency_id=? FOR UPDATE',[requestId,agencyId]);
  if(!account||!request||request.status!=='approved')fail('Only an approved request can be returned. Refresh before changing it.');
  const hours=Number(request.total_hours),bucket=request.request_type,column=LEAVE_BALANCE_COLUMNS[bucket];
  if(!['sick','training'].includes(bucket)||request.source_appointment_id)fail('This benefit requires its original workflow for changes.');
  if(!(hours>0)||Number(expectedHours)!==hours)fail('The approved hours changed. Refresh the request.');
  let rates;try{rates=typeof request.approved_rates_json==='string'?JSON.parse(request.approved_rates_json):request.approved_rates_json;}catch{fail('The saved leave-payment details need manual review.');}
  if(!Array.isArray(rates)||!rates.length)fail('This older approval has no saved payment details. Review it manually before changing pay.');
  const validated=validateLeaveItems(rates);
  if(Math.abs(validated.reduce((sum,r)=>sum+r.hours,0)-hours)>1e-6||rates.some(r=>!(Number(r.rate)>0)))fail('The approved hours and saved payment details do not agree.');
  const periodIds=[...new Set(rates.map(r=>Number(r.payrollPeriodId)))];
  if(periodIds.length!==1||!periodIds[0]||Number(request.approved_payroll_period_id)!==periodIds[0])fail('Review this multi-period approval manually before returning it.');
  const periodId=periodIds[0];
  const [[period]]=await db.execute('SELECT * FROM payroll_periods WHERE id=? AND agency_id=? FOR UPDATE',[periodId,agencyId]);
  if(!period||locked(period))fail('This PTO is in a posted payroll. Use a reviewed payroll correction instead.');
  const [ledger]=await db.execute('SELECT hours_delta FROM payroll_pto_ledger WHERE agency_id=? AND user_id=? AND request_id=? AND pto_bucket=? FOR UPDATE',[agencyId,request.user_id,requestId,bucket]);
  if(Math.abs(ledger.reduce((sum,l)=>sum+Number(l.hours_delta),0)+hours)>1e-6)fail('The request’s leave ledger needs reconciliation before returning it.');
  const [[adjustment]]=await db.execute('SELECT * FROM payroll_adjustments WHERE payroll_period_id=? AND user_id=? AND agency_id=? FOR UPDATE',[periodId,request.user_id,agencyId]);
  const payColumn=bucket==='sick'?'sick_pto_hours':'training_pto_hours';
  if(!adjustment||Number(adjustment[payColumn]||0)+1e-6<hours)fail('The payroll PTO hours do not include this entire approval. Refresh before changing it.');
  const oldHours=Number(adjustment.sick_pto_hours||0)+Number(adjustment.training_pto_hours||0),nextHours=Math.round((oldHours-hours)*100)/100;
  const removedPay=rates.reduce((sum,r)=>sum+Number(r.hours)*Number(r.rate),0),remainingPay=oldHours*Number(adjustment.pto_rate||0)-removedPay;
  if(remainingPay<-.011||(nextHours===0&&Math.abs(remainingPay)>.011))fail('The saved leave-payment amount does not reconcile with this payroll.');
  const nextRate=nextHours>0?Math.max(0,remainingPay)/nextHours:0;
  await db.execute(`UPDATE payroll_adjustments SET ${payColumn}=${payColumn}-?,pto_hours=?,pto_rate=?,updated_by_user_id=? WHERE payroll_period_id=? AND user_id=? AND agency_id=?`,[hours,nextHours,nextRate,actorUserId,periodId,request.user_id,agencyId]);
  for(const item of rates){
   const note=JSON.stringify({op:'return_pto_to_pending',requestId:Number(requestId),originalApprover:request.approved_by_user_id,approvedAt:request.approved_at,rate:Number(item.rate),hours:Number(item.hours)});
   if(note.length>255)fail('The approval history needs manual review before returning this request.');
   await db.execute("INSERT INTO payroll_pto_ledger(agency_id,user_id,entry_type,pto_bucket,hours_delta,effective_date,payroll_period_id,request_id,note,created_by_user_id) VALUES(?,?,'manual_adjustment',?,?,?,?,?,?,?)",[agencyId,request.user_id,bucket,Number(item.hours),item.date,periodId,requestId,note,actorUserId]);
  }
  await db.execute(`UPDATE payroll_pto_accounts SET ${column}=${column}+?,updated_by_user_id=? WHERE agency_id=? AND user_id=?`,[hours,actorUserId,agencyId,request.user_id]);
  await db.execute("UPDATE payroll_pto_requests SET status='submitted',approved_by_user_id=NULL,approved_at=NULL,approved_payroll_period_id=NULL,approved_rates_json=NULL,notes=CONCAT(COALESCE(notes,''),'\n',?) WHERE id=? AND agency_id=?",[`Approval returned to pending: ${hours} hours removed from payroll #${periodId}; review a later payroll before approving again.`,requestId,agencyId]);
  await db.execute('DELETE FROM payroll_summaries WHERE payroll_period_id=? AND agency_id=?',[periodId,agencyId]);
  await db.execute("UPDATE payroll_periods SET status='staged',ran_at=NULL,ran_by_user_id=NULL WHERE id=? AND agency_id=?",[periodId,agencyId]);
  await db.commit();return{returned:true,requestId:Number(requestId),returnedHours:hours,removedPay:Math.round(removedPay*100)/100,sourcePayrollPeriodId:periodId,requiresRerun:true};
 }catch(error){await db.rollback();throw error;}finally{db.release();}
}
