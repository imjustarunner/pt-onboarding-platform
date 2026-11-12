import pool from '../config/database.js';
import { encryptBillingSecret } from './billingEncryption.service.js';

export const NOTEWORTHY_TRIAL_DAYS=30;
export const NOTEWORTHY_RETENTION_DAYS=[0,7,30,90];
export const NOTEWORTHY_DELETION_NOTICE='Deletion removes active NoteWorthy payroll data, roster records, invitations, files and workspace messages. Your shared sign-in and required signed agreements are separate. Protected backup copies expire under platform backup retention; exported or emailed copies outside NoteWorthy are not recalled.';
export const trialDate=value=>value?new Date(value instanceof Date?value:`${String(value).replace(' ','T')}${/Z$|[+-]\d\d:\d\d$/.test(value)?'':'Z'}`):null;
const fail=(status,code,message)=>Object.assign(new Error(message),{status,code});
export function noteworthyTrialState(row,now=new Date()) {
  const end=trialDate(row.trial_ends_at),started=trialDate(row.trial_started_at);
  const days=NOTEWORTHY_RETENTION_DAYS.includes(Number(row.retention_days))?Number(row.retention_days):0;
  const deletionAt=row.deletion_requested_at?trialDate(row.deletion_requested_at):end&&!row.commercial_activated_at?new Date(end.getTime()+days*86400000):null;
  const expired=!!end && now>=end;
  const state=row.deleted_at?'deleted':row.deletion_requested_at?'deleting':row.commercial_activated_at?'active':!row.trial_policy_accepted_at?'setup':!started?'ready_for_approval':!expired?'trial':deletionAt&&now<deletionAt?'retained':'deletion_due';
  return {state,trialDays:30,cardRequired:false,policyAccepted:!!row.trial_policy_accepted_at,
    trialStartedAt:started?.toISOString() || null,trialEndsAt:end?.toISOString() || null,
    daysRemaining:end?Math.max(0,Math.ceil((end-now)/86400000)):30,
    retentionDays:days,retentionOptions:NOTEWORTHY_RETENTION_DAYS,scheduledDeletionAt:deletionAt?.toISOString() || null,
    continuationRequestedAt:row.continuation_requested_at || null,commercialActive:!!row.commercial_activated_at,
    deletionRequestedAt:row.deletion_requested_at || null,deletedAt:row.deleted_at || null,
    canWrite:!row.deleted_at && !row.deletion_requested_at && (!Number(row.trial_policy_version) || (!!row.trial_policy_accepted_at && (!expired || !!row.commercial_activated_at))),
    deletionNotice:NOTEWORTHY_DELETION_NOTICE};
}
export function createNoteworthyLifecycle({db=pool,now=()=>new Date(),encrypt=encryptBillingSecret}={}) {
  async function record(agencyId,executor=db) {
    try{const [[row]]=await executor.execute('SELECT * FROM noteworthy_practices WHERE agency_id=?',[agencyId]);return row || null;}
    catch(e){if(e.code==='ER_NO_SUCH_TABLE')return null;throw e;}
  }
  async function owner(userId,agencyId) {
    const [[row]]=await db.execute(`SELECT n.*,a.name,a.feature_flags FROM noteworthy_practices n JOIN agencies a ON a.id=n.agency_id
      JOIN users u ON u.id=n.owner_user_id WHERE n.agency_id=? AND n.owner_user_id=? AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
      AND (n.deletion_requested_at IS NOT NULL OR EXISTS(SELECT 1 FROM user_agencies m WHERE m.user_id=u.id AND m.agency_id=n.agency_id AND m.is_active=1 AND m.has_payroll_access=1))`,[agencyId,userId]);
    if(!row)throw fail(403,'PRACTICE_OWNER_REQUIRED','Only this practice’s active owner can manage its trial and data.');
    return row;
  }
  async function operator(userId) {
    const [[row]]=await db.execute("SELECT id FROM users WHERE id=? AND role='super_admin' AND is_active=1 AND COALESCE(is_archived,0)=0",[userId]);
    if(!row)throw fail(403,'OPERATOR_ACCESS_REQUIRED','FundThred operator access is required.');
  }
  async function status(userId,agencyId) {
    const row=await owner(userId,agencyId),[[job]]=await db.execute('SELECT status,attempts,error_code,completed_at FROM noteworthy_deletion_jobs WHERE agency_id=?',[agencyId]);
    return {...noteworthyTrialState(row,now()),deletionJob:job || null};
  }
  async function assertWritable(agencyId) {
    const row=await record(agencyId);if(!row)return;
    const state=noteworthyTrialState(row,now());
    if(!state.canWrite)throw Object.assign(fail(409,'NOTEWORTHY_TRIAL_ACTION_REQUIRED',state.policyAccepted?'This practice is read-only. Review its trial and data choices in NoteWorthy.':'Accept your trial and deletion choices in NoteWorthy before adding payroll data.'),{trial:state});
  }
  async function assertReadable(agencyId) {
    const row=await record(agencyId);
    if(row?.deletion_requested_at || row?.deleted_at)throw fail(409,'WORKSPACE_DELETION_PENDING','This NoteWorthy workspace is being deleted. Its deletion receipt remains available in Data & trial.');
  }
  async function policy(userId,agencyId,input) {
    const row=await owner(userId,agencyId);
    if(row.deletion_requested_at || row.deleted_at)throw fail(409,'DELETION_ALREADY_REQUESTED','This workspace is already being deleted.');
    const retentionDays=Number(input.retentionDays);
    if(input.acknowledged!==true || !['string','number'].includes(typeof input.retentionDays) || String(input.retentionDays).trim()==='' || !NOTEWORTHY_RETENTION_DAYS.includes(retentionDays))throw fail(400,'RETENTION_CHOICE_REQUIRED','Confirm the deletion policy and choose delete at trial end, or 7, 30, or 90 days of retention.');
    const start=now(),end=new Date(start.getTime()+30*86400000);
    const [result]=await db.execute(`UPDATE noteworthy_practices SET trial_policy_version=1,trial_policy_accepted_at=COALESCE(trial_policy_accepted_at,UTC_TIMESTAMP()),retention_days=?,
      continuation_requested_at=CASE WHEN ?<7 THEN NULL ELSE continuation_requested_at END,
      trial_started_at=CASE WHEN activated_at IS NOT NULL THEN COALESCE(trial_started_at,?) ELSE trial_started_at END,
      trial_ends_at=CASE WHEN activated_at IS NOT NULL THEN COALESCE(trial_ends_at,?) ELSE trial_ends_at END
      WHERE agency_id=? AND deletion_requested_at IS NULL AND deleted_at IS NULL`,[retentionDays,retentionDays,start,end,agencyId]);
    if(!result.affectedRows)throw fail(409,'DELETION_ALREADY_REQUESTED','This workspace is already being deleted.');
    return status(userId,agencyId);
  }
  async function requestContinue(userId,agencyId) {
    const row=await owner(userId,agencyId);
    if(row.deletion_requested_at || row.deleted_at)throw fail(409,'DELETION_ALREADY_REQUESTED','This workspace is already being deleted.');
    // An explicit request to continue holds data for at least seven days after
    // the trial while FundThred confirms the plan. It never charges a card.
    const [result]=await db.execute('UPDATE noteworthy_practices SET continuation_requested_at=COALESCE(continuation_requested_at,UTC_TIMESTAMP()),retention_days=CASE WHEN retention_days<7 THEN 7 ELSE retention_days END WHERE agency_id=? AND deletion_requested_at IS NULL AND deleted_at IS NULL',[agencyId]);
    if(!result.affectedRows)throw fail(409,'DELETION_ALREADY_REQUESTED','This workspace is already being deleted.');
    return status(userId,agencyId);
  }
  async function requestWipe(userId,agencyId,input) {
    const row=await owner(userId,agencyId);
    if(input.confirmed!==true || input.practiceName!==row.name)throw fail(400,'DELETION_CONFIRMATION_REQUIRED','Type the exact practice name and confirm permanent deletion.');
    await assertStandalone(agencyId);
    const conn=await db.getConnection();
    try{
      await conn.beginTransaction();
      await conn.execute('SELECT agency_id FROM noteworthy_practices WHERE agency_id=? FOR UPDATE',[agencyId]);
      await conn.execute('UPDATE noteworthy_practices SET deletion_requested_at=COALESCE(deletion_requested_at,UTC_TIMESTAMP()) WHERE agency_id=?',[agencyId]);
      await queue(agencyId,'owner_request',userId,conn);
      await conn.commit();
    }catch(error){await conn.rollback();throw error;}finally{conn.release();}
    return status(userId,agencyId);
  }
  async function assertStandalone(agencyId,executor=db) {
    const [[row]]=await executor.execute('SELECT feature_flags FROM agencies WHERE id=?',[agencyId]);
    let flags=row?.feature_flags;try{if(typeof flags==='string')flags=JSON.parse(flags);}catch{flags=null;}
    if(flags?.noteworthyPayrollOnly!==true)throw fail(409,'EHR_DATA_REVIEW_REQUIRED','This is not a standalone NoteWorthy workspace. Ask FundThred to review its connected products and records policy.');
    const [tables]=await executor.execute("SELECT TABLE_NAME name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('auricwell_practices','clients','appointments','hiring_candidates')");
    for(const table of tables){const [[found]]=await executor.execute(`SELECT 1 present FROM \`${table.name}\` WHERE agency_id=? LIMIT 1`,[agencyId]);if(found)throw fail(409,'EHR_DATA_REVIEW_REQUIRED','Clinical records or an EHR workspace are connected. Their records require a separate review; this deletion will not run.');}
  }
  async function queue(agencyId,reason,actor=null,executor=db) {
    await executor.execute("INSERT INTO noteworthy_deletion_jobs(agency_id,reason,requested_by_user_id) VALUES(?,?,?) ON DUPLICATE KEY UPDATE agency_id=agency_id",[agencyId,reason,actor]);
  }
  async function list(userId) {
    await operator(userId);
    const [rows]=await db.execute(`SELECT n.*,a.name,a.slug,u.email ownerEmail,j.status deletionStatus,j.error_code deletionError FROM noteworthy_practices n JOIN agencies a ON a.id=n.agency_id
      JOIN users u ON u.id=n.owner_user_id LEFT JOIN noteworthy_deletion_jobs j ON j.agency_id=n.agency_id ORDER BY n.created_at DESC LIMIT 200`);
    return {practices:rows.map(row=>({agencyId:row.agency_id,name:row.name,slug:row.slug,ownerEmail:row.ownerEmail,activationRequestedAt:row.activation_requested_at,activatedAt:row.activated_at,deletionStatus:row.deletionStatus,deletionError:row.deletionError,...noteworthyTrialState(row,now())}))};
  }
  async function activateCommercial(userId,agencyId,input) {
    await operator(userId);const row=await record(agencyId);
    if(!row || !row.activated_at || row.deletion_requested_at)throw fail(409,'PRACTICE_NOT_READY','Activate this practice’s agreements and data access before confirming an ongoing plan.');
    if(input.confirmed!==true || typeof input.billingReference!=='string' || !input.billingReference.trim() || input.billingReference.length>1000)throw fail(400,'PLAN_CONFIRMATION_REQUIRED','Confirm the agreed plan and enter its billing or order reference.');
    await db.execute('UPDATE noteworthy_practices SET commercial_activated_at=COALESCE(commercial_activated_at,UTC_TIMESTAMP()),commercial_evidence_enc=? WHERE agency_id=?',[JSON.stringify(encrypt(JSON.stringify({reference:input.billingReference,actorId:userId,confirmedAt:now().toISOString()}))),agencyId]);
    return noteworthyTrialState(await record(agencyId),now());
  }
  return {record,owner,operator,status,assertWritable,assertReadable,policy,requestContinue,requestWipe,assertStandalone,queue,list,activateCommercial};
}
export default createNoteworthyLifecycle();
