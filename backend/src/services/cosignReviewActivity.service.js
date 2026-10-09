import {policyError} from './supervisedBillingPolicy.service.js';
import {withSupervisorTimeLock,assertNoReviewTimeOverlap,assertNoMeetingOverlap} from './supervisionReviewTime.service.js';
const mysql=d=>new Date(d).toISOString().slice(0,23).replace('T',' ');
const instant=v=>v instanceof Date?v:new Date(String(v).includes('T')?v:String(v).replace(' ','T')+'Z');
const day=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
export function activeReviewSeconds(row,active,now=new Date()){
 const elapsed=(now-instant(row.last_heartbeat_at))/1000;
 return !row.ended_at&&row.is_active&&active===true&&elapsed>0&&elapsed<=30?elapsed:0;
}
export function assertOtherProviderNote({actorId,providerId,note,canAttest}){
 if(!canAttest||Number(actorId)===Number(providerId)||Number(note.created_by_user_id)===Number(actorId)||Number(note.provider_signed_by_user_id)===Number(actorId))throw policyError(403,'Only the assigned co-signer may track review of another provider’s note.');
 if(!note.provider_signed_at)throw policyError(409,'The author must sign the note before co-sign review time can be tracked.');
}
export async function startCosignActivity({agencyId,providerId,actorId,noteId,hash,sessionKey},source){
 if(!/^[a-zA-Z0-9-]{8,64}$/.test(sessionKey||''))throw policyError(400,'A review session ID is required.');
 return withSupervisorTimeLock([actorId],async db=>{
  const [[existing]]=await db.execute('SELECT * FROM cosign_review_activity WHERE supervisor_user_id=? AND session_key=?',[actorId,sessionKey]);
  if(existing){if(Number(existing.agency_id)!==agencyId||Number(existing.provider_user_id)!==providerId||Number(existing.note_id)!==noteId||existing.content_hash!==hash)throw policyError(409,'Session ID already used.');return existing;}
  const now=new Date();
  // Only one active review per person, even across tabs and agencies. Takeover never adds abandoned time.
  await db.execute('UPDATE cosign_review_activity SET ended_at=?,is_active=0 WHERE supervisor_user_id=? AND ended_at IS NULL',[mysql(now),actorId]);
  const [r]=await db.execute('INSERT INTO cosign_review_activity(agency_id,supervisor_user_id,provider_user_id,note_id,content_hash,session_key,started_at,last_heartbeat_at,is_active,claim_date) VALUES(?,?,?,?,?,?,?,?,1,?)',[agencyId,actorId,providerId,noteId,hash,sessionKey,mysql(now),mysql(now),day(now)]);
  return {id:r.insertId,active_seconds:0};
 },source);
}
export async function heartbeatCosignActivity({agencyId,providerId,actorId,id,active,close=false},source){
 return withSupervisorTimeLock([actorId],async db=>{
  await db.beginTransaction();try{
   const [[row]]=await db.execute('SELECT * FROM cosign_review_activity WHERE id=? AND agency_id=? AND provider_user_id=? AND supervisor_user_id=? FOR UPDATE',[id,agencyId,providerId,actorId]);
   if(!row)throw policyError(404,'Review session not found.');if(row.ended_at){await db.commit();return row;}
   const now=new Date(),seconds=activeReviewSeconds(row,active,now);let credited=seconds,pausedReason=null;
   if(seconds>0){try{await assertNoReviewTimeOverlap(db,[actorId],mysql(row.last_heartbeat_at),mysql(now));await assertNoMeetingOverlap(db,actorId,mysql(row.last_heartbeat_at),mysql(now));}catch(e){if(e.status!==409)throw e;credited=0;pausedReason=e.message;}}
   if(credited>0)await db.execute('INSERT INTO cosign_review_activity_intervals(activity_id,supervisor_user_id,start_at,end_at) VALUES(?,?,?,?)',[id,actorId,mysql(row.last_heartbeat_at),mysql(now)]);
   const total=Number(row.active_seconds)+credited;
   // Stop at the local day boundary; the next opened review starts a new payroll-date record.
   const ending=close||day(now)!==String(row.claim_date instanceof Date?row.claim_date.toISOString().slice(0,10):row.claim_date).slice(0,10);
   await db.execute('UPDATE cosign_review_activity SET active_seconds=?,last_heartbeat_at=?,is_active=?,ended_at=? WHERE id=?',[total,mysql(now),!ending&&active&&!pausedReason?1:0,ending?mysql(now):null,id]);await db.commit();
   return {...row,active_seconds:total,ended_at:ending?mysql(now):null,pausedReason};
  }catch(e){await db.rollback();throw e;}
 },source);
}
export async function submitCosignActivity({agencyId,providerId,actorId,id,attested},source){
 if(attested!==true)throw policyError(400,'Confirm the recorded time reflects your work and does not duplicate another claim.');
 return withSupervisorTimeLock([actorId],async db=>{
  await db.beginTransaction();try{
   const [[row]]=await db.execute('SELECT * FROM cosign_review_activity WHERE id=? AND agency_id=? AND provider_user_id=? AND supervisor_user_id=? FOR UPDATE',[id,agencyId,providerId,actorId]);
   if(!row)throw policyError(404,'Review session not found.');if(row.payroll_time_claim_id){await db.commit();return {claimId:row.payroll_time_claim_id};}
   if(!(Number(row.active_seconds)>0))throw policyError(409,'No active review time was recorded.');
   if(!row.ended_at && new Date()-instant(row.last_heartbeat_at)<30000)throw policyError(409,'Close the note review before submitting its time.');
   const payload={source:'cosign_review_activity',cosignActivityId:row.id,noteId:row.note_id,providerUserId:providerId,contentHash:row.content_hash,categoryGroup:'supervision_note',serviceCode:'Admin Time',bucket:'indirect',totalMinutes:Number(row.active_seconds)/60,attestation:true,description:'Review and co-signing of another provider’s note'};
   const [claim]=await db.execute("INSERT INTO payroll_time_claims(agency_id,user_id,status,claim_type,claim_date,payload_json) VALUES(?,?,'submitted','indirect_time',?,?)",[agencyId,actorId,row.claim_date,JSON.stringify(payload)]);
   await db.execute('UPDATE cosign_review_activity SET payroll_time_claim_id=?,ended_at=COALESCE(ended_at,last_heartbeat_at),is_active=0 WHERE id=?',[claim.insertId,id]);await db.commit();return {claimId:claim.insertId};
  }catch(e){await db.rollback();throw e;}
 },source);
}
