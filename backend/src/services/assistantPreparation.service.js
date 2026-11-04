import pool from '../config/database.js';
import service from './assistantTeams.service.js';
import {assistantError,assistantRef,assistantScheduleSlot,parseAssistantJson} from './assistantTeamPolicy.js';
import {assertAssistantOwner} from './assistantProvisioning.service.js';

export async function queueAssistantPreparation({accountId,actor=null,leadAgencyId=null,slot=null,db=pool,teams=service,now=new Date()}){
 if(actor)await assertAssistantOwner(actor,db);
 const a=await teams.accountById(accountId);
 if(leadAgencyId!==null&&Number(a.agency_id)!==Number(leadAgencyId))throw assistantError(403,'ASSISTANT_AGENCY_MISMATCH','This assistant belongs to another agency.');
 if(a.status!=='active'||a.group_status!=='ready'||['sales','team_lead'].includes(a.subrole))throw assistantError(409,'ASSISTANT_PREPARATION_DISABLED','Activate a verified worker duty before preparing work.');
 const key=slot||`manual:${now.toISOString().slice(0,16)}`;
 const ref=assistantRef();await db.execute('INSERT IGNORE INTO assistant_preparation_jobs(ref,account_id,agency_id,slot_key) VALUES (?,?,?,?)',[ref,a.id,a.agency_id,key]);
 const [[job]]=await db.execute('SELECT ref,state FROM assistant_preparation_jobs WHERE account_id=? AND slot_key=?',[a.id,key]);
 return {preparing:['queued','running'].includes(job.state),preparationRef:job.ref,status:job.state,queued:0};
}
export async function dispatchAssistantPreparation(userId,{db=pool,teams=service,now=new Date()}={}){
 const a=await teams.accountForUser(userId);if(a.subrole!=='team_lead'||a.status!=='active'||!parseAssistantJson(a.capabilities_json,[]).includes('team_lead.dispatch'))throw assistantError(403,'ASSISTANT_CAPABILITY_DISABLED','Team dispatch is not enabled.');
 const [workers]=await db.execute("SELECT id,schedule_json FROM assistant_accounts WHERE agency_id=? AND status='active' AND subrole NOT IN ('team_lead','sales') ORDER BY id",[a.agency_id]);
 let queued=0,skipped=0;const blocked=[];
 // The 07:00 lead prepares 07:10 work in advance; local schedule keys remain DST-aware.
 const lookAhead=new Date(now.getTime()+15*60000);
 for(const worker of workers){const slot=assistantScheduleSlot(parseAssistantJson(worker.schedule_json),lookAhead);if(!slot){skipped++;continue;}try{const result=await queueAssistantPreparation({accountId:worker.id,leadAgencyId:a.agency_id,slot,db,teams,now});if(result.preparing)queued++;else skipped++;}catch(e){blocked.push({reasonCode:e.code||'PREPARATION_UNAVAILABLE'});}}
 return {queued,skipped,blocked,preparationOnly:true};
}
export async function processAssistantPreparationJobs({db=pool,teams=service,maxBatches=3}={}){
 let batches=0,queued=0,blocked=0;
 while(batches<Math.max(1,Math.min(20,Number(maxBatches)||3))){
  const conn=await db.getConnection();let job;
  try{await conn.beginTransaction();const [[r]]=await conn.query("SELECT * FROM assistant_preparation_jobs WHERE state='queued' OR (state='running' AND lease_expires_at<UTC_TIMESTAMP(3)) ORDER BY updated_at,id LIMIT 1 FOR UPDATE SKIP LOCKED");if(!r){await conn.commit();break;}job=r;await conn.execute("UPDATE assistant_preparation_jobs SET state='running',lease_expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE) WHERE id=?",[job.id]);await conn.commit();}catch(e){await conn.rollback();throw e;}finally{conn.release();}
  try{
   const result=await teams.prepareAccount(job.account_id,{leadAgencyId:job.agency_id,slot:job.slot_key,cursor:job.source_cursor,maxPages:1});
   const blockedCount=result.blocked?.length||0;const state=result.nextCursor!=null?'queued':(Number(job.blocked_items||0)+blockedCount)>0?'blocked':'completed';
   await db.execute('UPDATE assistant_preparation_jobs SET state=?,source_cursor=?,queued_items=queued_items+?,skipped_items=skipped_items+?,blocked_items=blocked_items+?,last_reason_code=?,lease_expires_at=NULL WHERE id=?',[state,result.nextCursor||0,result.queued||0,result.skipped||0,blockedCount,result.blocked?.[0]?.reasonCode||null,job.id]);queued+=result.queued||0;blocked+=blockedCount;
  }catch(e){await db.execute("UPDATE assistant_preparation_jobs SET state='blocked',last_reason_code=?,lease_expires_at=NULL WHERE id=?",[String(e.code||'SOURCE_PREPARATION_UNAVAILABLE').slice(0,100),job.id]);blocked++;}
  batches++;
 }
 return {batches,queued,blocked};
}
