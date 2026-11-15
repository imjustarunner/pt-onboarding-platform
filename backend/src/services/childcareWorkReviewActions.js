// Invoked with the existing childcare transaction/authorization store. Nothing here approves payroll.
import {correctedChildcarePunches,normalizeChildcareWorkIntervals} from './childcareWorkReview.js';
import {calculateChildcarePay,childcareSnapshotHash,childcareWorkIntervals} from './childcarePay.service.js';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const parse=value=>typeof value==='string'?JSON.parse(value):value;
export function createChildcareWorkReviewActions(store){
 const {transaction,loadShift,authorizeShift,assigned,shiftSources,mapShift,refreshChildcarePay,audit,recordAttendance}=store;
 async function current(shift,userId,db){const sources=await shiftSources(shift,db);const snapshot=await calculateChildcarePay({shift,userId,...sources,db});return {sources,snapshot,hash:childcareSnapshotHash(snapshot)};}
 const timeKey=value=>typeof value==='string'&&value.length>=8&&value.length<=128;
 return {
  async submit({shiftId,userId,agencyId,confirmed}){return transaction(async db=>{
   if(confirmed!==true)fail(400,'Confirm these are your actual recorded work intervals.');
   await db.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[userId]);
   const shift=await loadShift(shiftId,db,{lock:true}),ctx=await authorizeShift(shift,userId,db);
   if(agencyId!=null&&Number(agencyId)!==Number(shift.agency_id))fail(403,'This shift belongs to another organization.');
   if(!ctx.canWork||!ctx.onShift)fail(403,'An assigned childcare employee must submit their own actual work.');
   const {sources,snapshot,hash}=await current(shift,userId,db);
   if(childcareWorkIntervals(sources.punches).open.has(Number(userId))||snapshot.totalMinutes<=0)fail(409,'Finish recording your actual work before submitting it.');
   const [[pending]]=await db.execute("SELECT id FROM childcare_time_corrections WHERE shift_id=? AND user_id=? AND status='pending' LIMIT 1",[shift.id,userId]);
   if(pending)fail(409,'Your time correction needs review before you submit the completed work.');
   const [[old]]=await db.execute('SELECT * FROM childcare_work_reviews WHERE shift_id=? AND user_id=? FOR UPDATE',[shift.id,userId]);
   if(old?.snapshot_hash===hash&&['submitted','approved'].includes(old.status))return {alreadyProcessed:true,shift:await mapShift(shift,userId,db)};
   await db.execute("INSERT INTO childcare_work_reviews(shift_id,user_id,status,snapshot_hash,submitted_at) VALUES (?,?,'submitted',?,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE status='submitted',snapshot_hash=VALUES(snapshot_hash),submitted_at=VALUES(submitted_at),reviewed_by_user_id=NULL,reviewed_at=NULL,review_note=NULL",[shift.id,userId,hash]);
   await refreshChildcarePay(shift,db);
   const auditRowId=await audit(db,{agencyId:shift.agency_id,userId,action:'childcare_work_submitted',metadata:{shiftId:shift.id,snapshotHash:hash,totalMinutes:snapshot.totalMinutes}});
   return {shift:await mapShift(shift,userId,db),auditRowId};
  });},
  async review({shiftId,userId,agencyId,targetUserId,decision,note,snapshotHash,confirmed}){return transaction(async db=>{
   if(decision==='approved'&&confirmed!==true)fail(400,'Confirm you reviewed the actual work and child attendance.');
   if(!['approved','rejected'].includes(decision)||!String(note||'').trim())fail(400,'Choose approval or return for correction and explain the review.');
   if(!Number.isSafeInteger(Number(targetUserId))||Number(targetUserId)<=0)fail(400,'Select the employee whose work you reviewed.');
   if(Number(userId)===Number(targetUserId))fail(403,'A separate authorized reviewer must sign off on your work.');
   await db.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[targetUserId]);
   const shift=await loadShift(shiftId,db,{lock:true}),ctx=await authorizeShift(shift,userId,db);
   if(agencyId!=null&&Number(agencyId)!==Number(shift.agency_id))fail(403,'This shift belongs to another organization.');
   if(!ctx.canApprove)fail(403,'Childcare work approval permission is required.');
   if(!await assigned(shift,targetUserId,db))fail(404,'This employee is not assigned to the shift.');
   const {sources,hash}=await current(shift,Number(targetUserId),db);
   const [[row]]=await db.execute('SELECT * FROM childcare_work_reviews WHERE shift_id=? AND user_id=? FOR UPDATE',[shift.id,targetUserId]);
   if(!row||row.status!=='submitted'||row.snapshot_hash!==hash||snapshotHash!==hash)fail(409,'The submitted work changed. Refresh and have the employee resubmit the current work.');
   if(childcareWorkIntervals(sources.punches).open.has(Number(targetUserId))||shift.attendance_review_required)fail(409,'Resolve open punches and disputed attendance before signing off.');
   await db.execute('UPDATE childcare_work_reviews SET status=?,reviewed_by_user_id=?,reviewed_at=UTC_TIMESTAMP(3),review_note=? WHERE shift_id=? AND user_id=?',[decision,userId,String(note).trim().slice(0,2000),shift.id,targetUserId]);
   await refreshChildcarePay(shift,db);
   const auditRowId=await audit(db,{agencyId:shift.agency_id,userId,action:'childcare_work_reviewed',metadata:{shiftId:shift.id,targetUserId:Number(targetUserId),decision,snapshotHash:hash,note:String(note).trim().slice(0,2000)}});
   return {shift:await mapShift(shift,userId,db),auditRowId};
  });},
  async requestCorrection({shiftId,userId,agencyId,intervals,actualChildren,reason,idempotencyKey,now=new Date()}){return transaction(async db=>{
   if(!timeKey(idempotencyKey)||!String(reason||'').trim())fail(400,'Explain the actual time correction and use a valid request key.');
   const actual=Number(actualChildren);if(actualChildren==null||actualChildren===''||!Number.isSafeInteger(actual)||actual<0||actual>1000)fail(400,'Record the actual child count at the beginning of this work.');
   const times=normalizeChildcareWorkIntervals(intervals,now);
   await db.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[userId]);
   const shift=await loadShift(shiftId,db,{lock:true}),ctx=await authorizeShift(shift,userId,db);
   if(agencyId!=null&&Number(agencyId)!==Number(shift.agency_id))fail(403,'This shift belongs to another organization.');
   if(!ctx.onShift||!ctx.canWork)fail(403,'Only an assigned active childcare employee may request their own time correction.');
   if(shift.status==='canceled')fail(409,'Ask the manager to review canceled-shift work.');
   const [[existing]]=await db.execute('SELECT * FROM childcare_time_corrections WHERE shift_id=? AND user_id=? AND request_key=?',[shift.id,userId,idempotencyKey]);
   if(existing){if(JSON.stringify(normalizeChildcareWorkIntervals(parse(existing.intervals_json),now))!==JSON.stringify(times)||Number(existing.actual_children)!==actual||existing.reason!==String(reason).trim().slice(0,2000))fail(409,'This request key was already used for a different correction.');return {alreadyProcessed:true,shift:await mapShift(shift,userId,db)};}
   const [[pending]]=await db.execute("SELECT id FROM childcare_time_corrections WHERE shift_id=? AND user_id=? AND status='pending' LIMIT 1",[shift.id,userId]);
   if(pending)fail(409,'Your existing time correction is still awaiting review.');
   const [created]=await db.execute('INSERT INTO childcare_time_corrections(shift_id,user_id,intervals_json,actual_children,reason,request_key) VALUES (?,?,?,?,?,?)',[shift.id,userId,JSON.stringify(times),actual,String(reason).trim().slice(0,2000),idempotencyKey]);
   await refreshChildcarePay(shift,db);
   const auditRowId=await audit(db,{agencyId:shift.agency_id,userId,action:'childcare_time_correction_requested',metadata:{shiftId:shift.id,correctionId:created.insertId}});
   return {shift:await mapShift(shift,userId,db),auditRowId};
  });},
  async reviewCorrection({shiftId,userId,agencyId,correctionId,decision,note}){return transaction(async db=>{
   if(!['approved','rejected'].includes(decision)||!String(note||'').trim())fail(400,'Explain approval or rejection of the actual time correction.');
   // Lock employee first, matching clocking and schedule operations.
   const [[initial]]=await db.execute('SELECT user_id FROM childcare_time_corrections WHERE id=? AND shift_id=?',[correctionId,shiftId]);
   if(!initial)fail(404,'Time correction not found.');
   if(Number(initial.user_id)===Number(userId))fail(403,'A separate authorized reviewer must review your correction.');
   await db.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[initial.user_id]);
   const shift=await loadShift(shiftId,db,{lock:true}),ctx=await authorizeShift(shift,userId,db);
   if(agencyId!=null&&Number(agencyId)!==Number(shift.agency_id))fail(403,'This shift belongs to another organization.');
   if(!ctx.canApprove)fail(403,'Childcare work approval permission is required.');
   const [[row]]=await db.execute('SELECT * FROM childcare_time_corrections WHERE id=? AND shift_id=? FOR UPDATE',[correctionId,shift.id]);
   if(!row||row.status!=='pending')fail(409,'This correction has already been reviewed. Refresh its current state.');
   if(!await assigned(shift,row.user_id,db))fail(409,'Review the employee assignment before correcting work.');
   if(decision==='approved'){
    const times=normalizeChildcareWorkIntervals(parse(row.intervals_json));
    // The employee lock also serializes clocking/corrections across their events.
    // Compare effective reviewed time, including missing clock-outs, rather than
    // just the original raw pairs that an earlier correction may have replaced.
    const [otherPunches]=await db.execute('SELECT id,company_event_id,user_id,punch_type,punched_at FROM skill_builders_event_kiosk_punches WHERE user_id=? AND company_event_id<>? ORDER BY company_event_id,punched_at,id',[row.user_id,shift.company_event_id]);
    const [otherCorrections]=await db.execute("SELECT c.*,s.company_event_id FROM childcare_time_corrections c JOIN childcare_shifts s ON s.id=c.shift_id WHERE c.user_id=? AND s.company_event_id<>? AND c.status='approved' ORDER BY c.id",[row.user_id,shift.company_event_id]);
    const eventIds=new Set([...otherPunches,...otherCorrections].map(p=>Number(p.company_event_id)));
    for(const eventId of eventIds){
      const effective=correctedChildcarePunches(otherPunches.filter(p=>Number(p.company_event_id)===eventId),otherCorrections.filter(p=>Number(p.company_event_id)===eventId));
      const recorded=childcareWorkIntervals(effective);
      const recordedIntervals=[...recorded.intervals,...[...recorded.open.values()].map(p=>({...p,endedAt:Infinity}))];
      if(times.some(interval=>recordedIntervals.some(p=>p.startedAt<+new Date(interval.endedAt)&&p.endedAt>+new Date(interval.startedAt))))fail(409,'This correction overlaps recorded work in another event. Review both records first.');
    }
    await recordAttendance(shift,{actualChildren:row.actual_children,userId,now:new Date(),effectiveAt:new Date(times[0].startedAt),source:'reviewed_time_start',reviewNote:String(note).trim()},db);
   }
   await db.execute('UPDATE childcare_time_corrections SET status=?,reviewed_by_user_id=?,reviewed_at=UTC_TIMESTAMP(3),review_note=? WHERE id=?',[decision,userId,String(note).trim().slice(0,2000),row.id]);
   await refreshChildcarePay(shift,db);
   const auditRowId=await audit(db,{agencyId:shift.agency_id,userId,action:'childcare_time_correction_reviewed',metadata:{shiftId:shift.id,correctionId:row.id,targetUserId:row.user_id,decision,note:String(note).trim().slice(0,2000)}});
   return {shift:await mapShift(shift,userId,db),auditRowId};
  });}
 };
}
