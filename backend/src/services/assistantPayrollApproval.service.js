/** An external browser click is required. This module is never called by a scheduler. */
import pool from '../config/database.js';
import {encryptFamilyBilling,decryptFamilyBilling} from './familyBillingEncryption.service.js';
import {assistantError,assistantRef,ASSISTANT_POLICY_VERSION,normalizeAssistantResult,parseAssistantJson} from './assistantTeamPolicy.js';
import {assertAssistantExecution,assertUnchangedAssistantConfiguration} from './assistantExecutionPolicy.service.js';
import {readPayrollReview,payrollProviderBasics,PAYROLL_REVIEW_KINDS} from './assistantPayrollReview.service.js';
import {invokeScopedPayrollCommand} from './assistantPayrollCommand.service.js';
const fail=(code,message='Reload this review before approving. No approval was applied.')=>assistantError(409,code,message);
async function notifyApproval({kind,claim,period}){if(kind!=='payroll_school_mileage')return;const{default:NotificationService}=await import('./notification.service.js');await NotificationService.createMileageClaimApprovedNotification({claim,agencyId:claim.agency_id,periodLabel:[period.period_start,period.period_end].map(v=>v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10)).join(' → ')});}
const uuid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/i.test(value);
export function createAssistantPayrollApproval({db=pool,load=readPayrollReview,encrypt=encryptFamilyBilling,decrypt=decryptFamilyBilling,invoke=invokeScopedPayrollCommand,handlers=async()=>import('../controllers/payroll.controller.js'),now=()=>new Date(),notify=notifyApproval}={}){
 async function account(userId,executor=db){const[[a]]=await executor.execute('SELECT * FROM assistant_accounts WHERE user_id=?',[userId]);if(!a||a.subrole!=='payroll')throw assistantError(403,'PAYROLL_ASSISTANT_REQUIRED','This action belongs to the Payroll Assistant.');return a;}
 async function run(a,ref,executor=db,lock=false){const[[r]]=await executor.execute(`SELECT r.*,w.ref work_ref,w.task_kind,w.source_kind,w.source_id,w.source_hash work_source_hash,w.packet_ciphertext,w.mapping_ciphertext,w.state FROM assistant_runs r JOIN assistant_work_items w ON w.id=r.work_id WHERE r.ref=? AND r.account_id=? AND r.agency_id=?${lock?' FOR UPDATE':''}`,[ref,a.id,a.agency_id]);if(!r||!PAYROLL_REVIEW_KINDS[r.source_kind])throw assistantError(404,'PAYROLL_RUN_NOT_FOUND','Payroll review not found.');return r;}
 function active(r){if(r.completed_at||r.state!=='leased'||new Date(r.lease_expires_at)<=now()||now()-new Date(r.started_at)>30*60000)throw fail('RUN_LEASE_EXPIRED');}
 async function providerDetails(userId,runRef,staffRef){
  if(!uuid(runRef)||!uuid(staffRef))throw assistantError(404,'PROVIDER_REFERENCE_UNAVAILABLE','Provider reference unavailable.');const a=await account(userId);const r=await run(a,runRef);await assertAssistantExecution(a,r.task_kind==='payroll.review_supervision_history'?'payroll.review_supervision_history':'payroll.review',db);active(r);if(parseAssistantJson(a.capabilities_json,[]).includes('payroll.review_supervision_history'))await assertAssistantExecution(a,'payroll.review_supervision_history',db);
  const mapping=decrypt(r.mapping_ciphertext,`assistant-work:${a.agency_id}:${a.id}:${r.work_ref}:mapping`);const target=mapping.references?.[staffRef];if(target?.kind!=='user'||Number(target.id)!==Number(mapping.userId))throw assistantError(404,'PROVIDER_REFERENCE_UNAVAILABLE','Provider reference unavailable.');
  const source=await load({agencyId:a.agency_id,kind:r.source_kind,sourceId:r.source_id},db);if(source.sourceRevision!==r.source_hash)throw fail('ASSISTANT_SOURCE_CHANGED');
  await db.execute('UPDATE assistant_runs SET evidence_ciphertext=? WHERE id=? AND completed_at IS NULL',[encrypt({providerFactsRevision:source.sourceRevision,providerFactsViewedAt:now().toISOString()},`assistant-run:${a.agency_id}:${runRef}`),r.id]);
  return {staffRef,...payrollProviderBasics(source.provider,source.evaluation.provider.participation),...(parseAssistantJson(a.capabilities_json,[]).includes('payroll.review_supervision_history')&&source.supervisionReview?{superviseeSupervision:source.supervisionReview.facts}:{})};
 }
 async function completedResult(a,r,executor){const[[p]]=await executor.execute('SELECT ref,payload_ciphertext FROM assistant_proposals WHERE run_id=?',[r.id]);let result;try{result=p&&decrypt(p.payload_ciphertext,`assistant-proposal:${a.agency_id}:${p.ref}`);}catch{}if(r.outcome!=='PASS'||result?.evidence?.approval?.capability!==PAYROLL_REVIEW_KINDS[r.source_kind])throw fail('PAYROLL_RUN_ALREADY_COMPLETED','This review was already completed without a payroll approval.');return {approved:true,reused:true,proposalRef:p.ref};}
 async function approve(userId,runRef,input){
  if(!uuid(runRef)||Object.keys(input||{}).some(key=>!['sourceRevision','evidence'].includes(key)))throw assistantError(400,'SCOPED_APPROVAL_INPUT_REQUIRED','Use the current review and its evidence. Pay amounts, time, tiers and periods cannot be overridden.');
  const a=await account(userId),r=await run(a,runRef),capability=PAYROLL_REVIEW_KINDS[r.source_kind];if(!capability?.startsWith('payroll.approve_'))throw assistantError(403,'PAYROLL_APPROVAL_DUTY_REQUIRED','This is a read-only supervision review.');await assertAssistantExecution(a,capability,db);await assertAssistantExecution(a,'payroll.review',db);
  if(r.completed_at)return completedResult(a,r,db);
  active(r);if(input.sourceRevision!==r.source_hash)throw fail('ASSISTANT_SOURCE_CHANGED');
  const result=normalizeAssistantResult({outcome:'PASS',findings:[],evidence:input.evidence});
  const c=await db.getConnection();let approved=false,proposalRef,notification;
  try{await c.beginTransaction();const[[current]]=await c.execute('SELECT * FROM assistant_accounts WHERE id=? FOR UPDATE',[a.id]);assertUnchangedAssistantConfiguration(a,current);await assertAssistantExecution(current,capability,c);await assertAssistantExecution(current,'payroll.review',c);
   const locked=await run(a,runRef,c,true);if(locked.completed_at){const result=await completedResult(a,locked,c);await c.rollback();return result;}active(locked);
   const source=await load({agencyId:a.agency_id,kind:locked.source_kind,sourceId:locked.source_id,lock:true},c);
   let profileReview;try{profileReview=decrypt(locked.evidence_ciphertext,`assistant-run:${a.agency_id}:${runRef}`);}catch{}
   if(profileReview?.providerFactsRevision!==locked.source_hash)throw fail('PROVIDER_FACTS_REVIEW_REQUIRED','Open the provider details for this current submission before approving.');
   if(source.sourceRevision!==locked.source_hash||locked.work_source_hash!==locked.source_hash)throw fail('ASSISTANT_SOURCE_CHANGED');
   if(!source.evaluation.eligible)throw fail('PAYROLL_REVIEW_REQUIRES_HUMAN','The current source requires payroll review. No approval was applied.');
   const controller=await handlers();const kind=locked.source_kind==='payroll_school_mileage'?'school_mileage':'individual_supervision';
   await invoke({account:current,kind,claimId:source.claim.id,periodId:source.period.id,tierLevel:source.claim.tier_level,db:c},kind==='school_mileage'?controller.patchMileageClaim:controller.patchTimeClaim);
   const after=await load({agencyId:a.agency_id,kind:locked.source_kind,sourceId:locked.source_id,lock:true},c);
   if(after.claim.status!=='approved'||Math.abs(Number(after.claim.applied_amount)-Number(source.amount))>0.005)throw fail('PAYROLL_APPROVAL_UNCONFIRMED');
   const packet=decrypt(locked.packet_ciphertext,`assistant-work:${a.agency_id}:${a.id}:${locked.work_ref}:packet`);
   proposalRef=assistantRef();result.findings=[{category:'payroll_approval',severity:'review',message:'The external reviewer approved this unchanged submission using its permitted browser action.',sourceRefs:packet.items?.[0]?.ref?[packet.items[0].ref]:[],recommendation:'Include the approved submission in ordinary human payroll preparation.',uncertainty:'Approval does not run, post or transmit payroll.'}];
   result.evidence.taskVersion=ASSISTANT_POLICY_VERSION;result.evidence.accountPolicyRevision=Number(current.policy_revision);result.evidence.approval={capability,beforeRevision:source.sourceRevision,afterRevision:after.sourceRevision,amount:Number(after.claim.applied_amount),providerFactsReviewed:true};
   await c.execute('INSERT INTO assistant_proposals(ref,work_id,run_id,account_id,agency_id,source_hash,payload_ciphertext) VALUES (?,?,?,?,?,?,?)',[proposalRef,locked.work_id,locked.id,a.id,a.agency_id,after.sourceRevision,encrypt(result,`assistant-proposal:${a.agency_id}:${proposalRef}`)]);
   await c.execute("UPDATE assistant_runs SET completed_at=UTC_TIMESTAMP(3),outcome='PASS',source_hash=?,evidence_ciphertext=? WHERE id=?",[after.sourceRevision,encrypt(result.evidence,`assistant-run:${a.agency_id}:${runRef}`),locked.id]);
   await c.execute("UPDATE assistant_work_items SET state='completed',source_hash=? WHERE id=?",[after.sourceRevision,locked.work_id]);await c.commit();approved=true;notification={kind:locked.source_kind,claim:after.claim,period:source.period};
  }catch(e){await c.rollback();throw e;}finally{c.release();}
  if(notification)try{await notify(notification);}catch{/* Ordinary mileage approval notices remain best effort, as in the human workflow. */}
  return {approved,proposalRef,sourceRecordsChanged:true,payrollPosted:false};
 }
 return {approve,providerDetails};
}
export default createAssistantPayrollApproval();
