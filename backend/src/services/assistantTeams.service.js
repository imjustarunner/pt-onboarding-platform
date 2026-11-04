import pool from '../config/database.js';
import {readPayrollReview,PAYROLL_REVIEW_KINDS} from './assistantPayrollReview.service.js';
import bcrypt from 'bcrypt';
import {getMedicalBillingFlags} from './medicalBillingFlags.service.js';
import {encryptFamilyBilling,decryptFamilyBilling} from './familyBillingEncryption.service.js';
import {ASSISTANT_CATALOG,ASSISTANT_POLICY_VERSION,assistantError,assistantRef,assistantDigest,assistantStoredConfigurationHash,parseAssistantJson,publicAssistantAccount,safeWorkerIdentity,assertAssistantCapabilities,assertAccountCapability,assertNarrativeRelease,validateAssistantSchedule,assistantScheduleSlot,normalizeAssistantResult} from './assistantTeamPolicy.js';
import {assertAssistantOwner,countAssistantSchools,provisionAssistantAccounts,provisionAssistantGroup} from './assistantProvisioning.service.js';
import {recordAssistantChange} from './assistantAccountAlerts.service.js';
import {listOperationalSources,buildOperationalPacket,operationalSourceRevision} from './assistantOperationalPackets.service.js';
import {buildClinicalReviewPacket,readSourceRevision,inventoryEligibleCharts} from './assistantReviewPackets.service.js';
import {assertAssistantExecution,assertUnchangedAssistantConfiguration} from './assistantExecutionPolicy.service.js';

const accountSql="SELECT aa.*,u.email,CONCAT(u.first_name,' ',u.last_name) display_name,a.name agency_name,a.slug agency_slug,a.feature_flags agency_feature_flags FROM assistant_accounts aa JOIN users u ON u.id=aa.user_id JOIN agencies a ON a.id=aa.agency_id";
const n=v=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):0;
const uuid=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/i.test(v);
const configurationHash=a=>assistantDigest({subrole:a.subrole,baa:a.baa_status,privacy:parseAssistantJson(a.privacy_policy_json)});
const packetRefs=p=>{const out=[];function walk(v){if(!v||typeof v!=='object')return;for(const [k,x]of Object.entries(v)){if((k==='ref'||k==='sourceRef'||k==='staffRef')&&typeof x==='string')out.push(x);else if(k==='sourceRefs'&&Array.isArray(x))out.push(...x.filter(i=>typeof i==='string'));else if(typeof x==='object')walk(x);}}walk(p);return [...new Set(out)];};
const clock=()=>new Date();
export function createAssistantTeamsService({db=pool,clinicalPacket=buildClinicalReviewPacket,clinicalRevision=readSourceRevision,inventory=inventoryEligibleCharts,operationalSources=listOperationalSources,operationalPacket=buildOperationalPacket,operationalRevision=operationalSourceRevision,encrypt=encryptFamilyBilling,decrypt=decryptFamilyBilling,now=clock}={}){
 async function accountById(id,executor=db){const [[a]]=await executor.execute(`${accountSql} WHERE aa.id=?`,[n(id)]);if(!a)throw assistantError(404,'ASSISTANT_NOT_FOUND','Assistant account not found.');return a;}
 async function accountForUser(userId,executor=db){const [[a]]=await executor.execute(`${accountSql} WHERE aa.user_id=?`,[n(userId)]);if(!a)throw assistantError(403,'ASSISTANT_ACCOUNT_REQUIRED','An assistant account is required.');return a;}
 async function requireRunnable(a,cap,executor=db){
  await assertAssistantExecution(a,cap,executor);
  if(['clinical','compliance'].includes(a.subrole)){
   // Locked account reads intentionally contain account columns only. Recheck the
   // bound agency inside that transaction instead of treating an absent projection
   // as a disabled flag (or copying a possibly stale pre-transaction projection).
   let flags=a.agency_feature_flags;
   if(flags===undefined){const [[agency]]=await executor.execute('SELECT feature_flags FROM agencies WHERE id=? AND is_active=1 AND COALESCE(is_archived,0)=0',[a.agency_id]);flags=agency?.feature_flags;}
   if(!getMedicalBillingFlags({feature_flags:flags}).clinicalChartEnabled)throw assistantError(409,'AGENCY_SERVICE_DISABLED','Clinical review is not enabled for this agency.');
  }
  if(a.subrole==='school_support'&&!await countAssistantSchools(a.agency_id,executor)){if(executor===db)await pauseAccount(a,'The final linked school is no longer available.');throw assistantError(409,'NO_LINKED_SCHOOLS','This agency has no linked school.');}
 }
 async function pauseAccount(a,reason){const c=await db.getConnection();try{await c.beginTransaction();await c.execute("UPDATE assistant_accounts SET status='paused',policy_revision=policy_revision+1 WHERE id=?",[a.id]);await c.execute('UPDATE assistant_accounts SET configuration_fingerprint=? WHERE id=?',[assistantStoredConfigurationHash({...a,status:'paused',policy_revision:Number(a.policy_revision)+1}),a.id]);await recordAssistantChange(c,{accountId:a.id,agencyId:a.agency_id,eventType:'account_paused',changes:{status:'paused'},reason});await c.commit();}catch(e){await c.rollback();throw e;}finally{c.release();}}
 async function revoke(c,userId,actorId){await c.execute(`INSERT INTO user_auth_revocations(user_id,reject_issued_before,revoked_at,revoked_by_user_id) VALUES (?,UNIX_TIMESTAMP()+1,UTC_TIMESTAMP(3),?) ON DUPLICATE KEY UPDATE reject_issued_before=VALUES(reject_issued_before),revoked_at=VALUES(revoked_at),revoked_by_user_id=VALUES(revoked_by_user_id)`,[userId,actorId]);await c.execute('UPDATE auth_session_security SET revoked_at=COALESCE(revoked_at,UTC_TIMESTAMP(3)) WHERE user_id=? AND revoked_at IS NULL',[userId]);}
 async function ownerOverview(actor){await assertAssistantOwner(actor,db);const [accounts]=await db.execute(`${accountSql} ORDER BY aa.agency_id,aa.subrole`);const [agencies]=await db.execute("SELECT id,name,slug FROM agencies WHERE id IN (2,6,377,450,453) AND is_active=1 ORDER BY id");const [changes]=await db.execute('SELECT event_key ref,account_id accountId,agency_id agencyId,event_type eventType,changes_json changes,email_status emailStatus,notification_at notificationAt,created_at createdAt FROM assistant_change_events ORDER BY id DESC LIMIT 100');const [proposals]=await db.execute('SELECT p.ref,p.account_id accountId,p.agency_id agencyId,a.subrole,p.decision,p.created_at createdAt FROM assistant_proposals p JOIN assistant_accounts a ON a.id=p.account_id ORDER BY p.id DESC LIMIT 100');const [verifications]=await db.execute('SELECT account_id accountId,capability,outcome,build_id buildId,evidence_ref evidenceRef,policy_version policyVersion FROM assistant_verifications');return {accounts:accounts.map(publicAssistantAccount),agencies,catalog:ASSISTANT_CATALOG,changes,proposals,verifications,policyVersion:ASSISTANT_POLICY_VERSION};}
 async function patchAccount(actor,id,input){
  await assertAssistantOwner(actor,db);const a=await accountById(id);const fields=new Set(['status','capabilities','schedule','baaStatus','privacyPolicy','reason','newPassword']);if(Object.keys(input).some(k=>!fields.has(k)))throw assistantError(400,'IMMUTABLE_ASSISTANT_IDENTITY','Identity, agency and subrole cannot be changed.');
  if(typeof input.reason!=='string'||input.reason.trim().length<5)throw assistantError(400,'CHANGE_REASON_REQUIRED','Explain the account change.');
  const status=input.status??a.status;if(!['pending','active','paused','disabled'].includes(status))throw assistantError(400,'INVALID_STATUS','Choose an account status.');
  const capabilities=input.capabilities===undefined?parseAssistantJson(a.capabilities_json,[]):assertAssistantCapabilities(a.subrole,input.capabilities);
  const schedule=input.schedule===undefined?parseAssistantJson(a.schedule_json):validateAssistantSchedule(input.schedule);
  const baa=input.baaStatus??a.baa_status;if(!['pending','verified'].includes(baa))throw assistantError(400,'INVALID_BAA_STATUS','Choose pending or verified BAA status.');
  const privacy=input.privacyPolicy===undefined?parseAssistantJson(a.privacy_policy_json):input.privacyPolicy;if(!privacy||typeof privacy!=='object'||Array.isArray(privacy)||JSON.stringify(privacy).length>100000)throw assistantError(400,'INVALID_PRIVACY_POLICY','Enter a bounded release policy.');
  if(input.newPassword!==undefined&&(typeof input.newPassword!=='string'||input.newPassword.length<16||input.newPassword.length>200))throw assistantError(400,'INVALID_PASSWORD','Use a password of 16–200 characters.');
  const candidate={...a,baa_status:baa,privacy_policy_json:privacy};
  if(status==='active'){
   if(a.group_status!=='ready'||(!a.credential_set_at&&!input.newPassword))throw assistantError(409,'ACCOUNT_SETUP_INCOMPLETE','Verify the group and set its unique password before activation.');
   if(a.subrole==='school_support'&&!await countAssistantSchools(a.agency_id,db))throw assistantError(409,'NO_LINKED_SCHOOLS','No linked school is available.');
   if(capabilities.length&&['clinical','compliance'].includes(a.subrole))assertNarrativeRelease(candidate);
   // QA identities can exercise a new duty to produce its verification evidence.
   if(![450,453].includes(Number(a.agency_id)))for(const capability of capabilities){const [[proof]]=await db.execute("SELECT id FROM assistant_verifications WHERE account_id=? AND capability=? AND policy_version=? AND configuration_hash=? AND outcome='PASS'",[a.id,capability,ASSISTANT_POLICY_VERSION,configurationHash(candidate)]);if(!proof)throw assistantError(409,'CAPABILITY_NOT_VERIFIED','Record a passing external test for this duty and configuration before activation.');}
  }
  if(a.subrole==='sales'&&(capabilities.length||schedule.enabled))throw assistantError(409,'SALES_DORMANT','Sales has no enabled duties or schedule.');
  const c=await db.getConnection();try{await c.beginTransaction();await c.execute('UPDATE assistant_accounts SET status=?,capabilities_json=?,schedule_json=?,baa_status=?,privacy_policy_json=?,policy_revision=policy_revision+1 WHERE id=?',[status,JSON.stringify(capabilities),JSON.stringify(schedule),baa,JSON.stringify(privacy),a.id]);if(input.newPassword){const passwordHash=await bcrypt.hash(input.newPassword,12);await c.execute('UPDATE users SET password_hash=? WHERE id=?',[passwordHash,a.user_id]);await c.execute('UPDATE assistant_accounts SET credential_set_at=UTC_TIMESTAMP(3),credential_fingerprint=SHA2(?,256) WHERE id=?',[passwordHash,a.id]);}await c.execute('UPDATE assistant_accounts SET configuration_fingerprint=? WHERE id=?',[assistantStoredConfigurationHash({...a,status,capabilities_json:capabilities,schedule_json:schedule,baa_status:baa,privacy_policy_json:privacy,policy_revision:Number(a.policy_revision)+1}),a.id]);await revoke(c,a.user_id,actor.id);await recordAssistantChange(c,{accountId:a.id,agencyId:a.agency_id,actorUserId:actor.id,eventType:'configuration_changed',changes:{status,capabilities,schedule,baaStatus:baa,privacyPolicyRevision:String(privacy.revision||''),policyRevision:Number(a.policy_revision)+1,credentialChanged:!!input.newPassword},reason:input.reason.trim()});await c.commit();}catch(e){await c.rollback();throw e;}finally{c.release();}
  return publicAssistantAccount(await accountById(a.id));
 }
 async function verifyCapability(actor,id,input){await assertAssistantOwner(actor,db);const a=await accountById(id);assertAssistantCapabilities(a.subrole,[input.capability]);if(!['PASS','FAIL','BLOCKED','NOT_RUN'].includes(input.outcome)||typeof input.buildId!=='string'||input.buildId.length<7||input.buildId.length>100||typeof input.evidenceRef!=='string'||input.evidenceRef.length<5||input.evidenceRef.length>500)throw assistantError(400,'TEST_EVIDENCE_REQUIRED','Record the external result, build and evidence reference.');const c=await db.getConnection();try{await c.beginTransaction();await c.execute(`INSERT INTO assistant_verifications(account_id,capability,policy_version,configuration_hash,outcome,build_id,evidence_ref,verified_by_user_id) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE configuration_hash=VALUES(configuration_hash),outcome=VALUES(outcome),build_id=VALUES(build_id),evidence_ref=VALUES(evidence_ref),verified_by_user_id=VALUES(verified_by_user_id),created_at=UTC_TIMESTAMP(3)`,[a.id,input.capability,ASSISTANT_POLICY_VERSION,configurationHash(a),input.outcome,input.buildId,input.evidenceRef,actor.id]);if(input.outcome!=='PASS'){await c.execute("UPDATE assistant_accounts SET status=IF(status='active','paused',status),policy_revision=policy_revision+1,configuration_fingerprint=? WHERE id=?",[assistantStoredConfigurationHash({...a,status:a.status==='active'?'paused':a.status,policy_revision:Number(a.policy_revision)+1}),a.id]);await revoke(c,a.user_id,actor.id);}await recordAssistantChange(c,{accountId:a.id,agencyId:a.agency_id,actorUserId:actor.id,eventType:'verification_recorded',changes:{verification:{capability:input.capability,outcome:input.outcome,buildId:input.buildId}},reason:input.reason||'Owner reviewed external verification evidence'});await c.commit();}catch(e){await c.rollback();throw e;}finally{c.release();}return {recorded:true};}
 async function storePacket(a,kind,sourceKind,sourceId,result,slot=null){
  if(result.status!=='ready'||!result.packet||!result.sourceRevision)return false;
  const ref=assistantRef(),context=`assistant-work:${a.agency_id}:${a.id}:${ref}`;
  const [out]=await db.execute(`INSERT IGNORE INTO assistant_work_items(ref,account_id,agency_id,task_kind,title,source_kind,source_id,source_hash,packet_ciphertext,mapping_ciphertext,due_at,slot_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,[ref,a.id,a.agency_id,kind,ASSISTANT_CATALOG.find(x=>x.key===a.subrole).label+' review',sourceKind,sourceId,result.sourceRevision,encrypt(result.packet,context+':packet'),encrypt(result.mapping,context+':mapping'),now(),slot]);
  // New source versions supersede only unaccepted/in-progress work, never erase history.
  if(out.affectedRows){await db.execute("UPDATE assistant_work_items SET state='stale' WHERE account_id=? AND source_kind=? AND source_id=? AND source_hash<>? AND state IN ('queued','leased')",[a.id,sourceKind,sourceId,result.sourceRevision]);await db.execute("UPDATE assistant_proposals p JOIN assistant_work_items w ON w.id=p.work_id SET p.decision='stale' WHERE w.account_id=? AND w.source_kind=? AND w.source_id=? AND p.source_hash<>? AND p.decision='pending'",[a.id,sourceKind,sourceId,result.sourceRevision]);return true;}return false;
 }
 async function prepareAccount(id,{actor=null,slot=null,leadAgencyId=null,cursor=0,maxPages=1}={}){
  if(actor)await assertAssistantOwner(actor,db);
  const a=await accountById(id);
  if(leadAgencyId!==null&&Number(a.agency_id)!==Number(leadAgencyId))throw assistantError(403,'ASSISTANT_AGENCY_MISMATCH','This account belongs to another agency.');
  const role=ASSISTANT_CATALOG.find(x=>x.key===a.subrole);
  if(!role||['sales','team_lead'].includes(a.subrole))return {queued:0,skipped:1,blocked:[],nextCursor:null};
  const capability=a.subrole==='marketing'?'marketing.analytics':`${a.subrole}.review`;
  await requireRunnable(a,capability);
  let queued=0,skipped=0,nextCursor=null;const blocked=[];
  if(['clinical','compliance'].includes(a.subrole)){
   const privacyPolicy=assertNarrativeRelease(a);
   const [[previous]]=await db.execute("SELECT created_at FROM assistant_preparation_jobs WHERE account_id=? AND state='completed' ORDER BY created_at DESC,id DESC LIMIT 1",[a.id]);
   const changedSince=!String(slot||'').startsWith('manual:')&&previous&&new Date(a.updated_at)<=new Date(previous.created_at)?new Date(new Date(previous.created_at).getTime()-60000):null;
   const page=await inventory({agencyId:Number(a.agency_id),afterId:Number(cursor)||0,limit:1,changedSince});
   const charts=Array.isArray(page)?page:page.charts;
   if(!Array.isArray(charts))throw assistantError(503,'INVALID_CHART_PAGE','Chart pagination needs review.');
   nextCursor=Array.isArray(page)?(charts.length?Number(charts.at(-1).clientId??charts.at(-1).id):null):page.nextCursor;
   if(nextCursor!==null&&Number(nextCursor)<=Number(cursor))throw assistantError(503,'INVALID_CHART_PAGE','Chart pagination did not advance.');
   for(const chart of charts){
    const clientId=Number(chart.clientId??chart.id);if(!clientId||clientId<=Number(cursor))throw assistantError(503,'INVALID_CHART_PAGE','Chart pagination needs review.');
    const input={agencyId:Number(a.agency_id),clientId,subrole:a.subrole,privacyPolicy};
    try{
     const revision=await clinicalRevision(input);
     const [[exists]]=await db.execute('SELECT id FROM assistant_work_items WHERE account_id=? AND task_kind=? AND source_hash=?',[a.id,capability,typeof revision==='string'?revision:revision.sourceRevision]);
     if(exists){skipped++;continue;}
     const result=await clinicalPacket(input);
     if(result.status!=='ready'){blocked.push({reasonCode:result.reasonCode||'PREPARATION_BLOCKED'});continue;}
     const fresh=await accountById(a.id);assertUnchangedAssistantConfiguration(a,fresh);await requireRunnable(fresh,capability);
     if(await storePacket(a,capability,'clinical_chart',clientId,result,slot))queued++;else skipped++;
    }catch(e){blocked.push({reasonCode:e.reasonCode||e.code||'SOURCE_PREPARATION_UNAVAILABLE'});}
   }
  }else if(a.subrole==='marketing'){
   const {prepareAssistantMarketingPackets}=await import('./assistantMarketing.service.js');
   for(const result of await prepareAssistantMarketingPackets(a,{db})){if(await storePacket(a,capability,'marketing_page',result.mapping.pageId,result,slot))queued++;else skipped++;}
  }else{
   const batch=await operationalSources({agencyId:Number(a.agency_id),subrole:a.subrole,afterId:Number(cursor)||0,limit:100,capabilities:parseAssistantJson(a.capabilities_json,[])},db);
   for(const row of batch){const result=await operationalPacket({agencyId:Number(a.agency_id),subrole:a.subrole,row,capabilities:parseAssistantJson(a.capabilities_json,[])},db);if(result.taskKind)await requireRunnable(a,result.taskKind);if(await storePacket(a,result.taskKind||capability,result.sourceKind||row.sourceKind,row.id,result,slot))queued++;else skipped++;}
   if(batch.length===100)nextCursor=Number(batch.at(-1).sourceCursor??batch.at(-1).id);
  }
  return {queued,skipped,blocked,nextCursor};
 }
 async function expireLeases(a,executor=db){await executor.execute("UPDATE assistant_work_items w JOIN assistant_runs r ON r.work_id=w.id SET w.state='queued' WHERE w.account_id=? AND w.state='leased' AND r.completed_at IS NULL AND r.lease_expires_at<UTC_TIMESTAMP(3)",[a.id]);}
 function safeRunSummary(row,agencyId){
  if(!row)return null;
  let evidenceComplete=false;
  try{const evidence=decrypt(row.evidenceCiphertext,`assistant-run:${agencyId}:${row.runRef}`);evidenceComplete=['browser','viewport','buildId','observedAt'].every(key=>typeof evidence?.[key]==='string'&&evidence[key].trim().length>0)&&Array.isArray(evidence.steps)&&evidence.steps.length>0&&evidence.steps.every(step=>typeof step==='string'&&step.trim().length>0);}catch{/* Missing or unreadable evidence is incomplete; never release its contents. */}
  const start=new Date(row.startedAt).getTime(),end=new Date(row.completedAt).getTime();
  return {outcome:row.outcome,startedAt:row.startedAt||null,completedAt:row.completedAt||null,evidenceComplete,durationSeconds:Number.isFinite(start)&&Number.isFinite(end)&&end>=start?Math.round((end-start)/1000):null};
 }
 async function workspace(userId){
  const a=await accountForUser(userId);await expireLeases(a);
  const [tasks]=await db.execute("SELECT ref,title,state status,task_kind taskKind,due_at dueAt,source_hash sourceRevision FROM assistant_work_items WHERE account_id=? AND agency_id=? AND state IN ('queued','leased','blocked') ORDER BY priority DESC,due_at,id LIMIT 100",[a.id,a.agency_id]);
  const result={identity:safeWorkerIdentity(a),tasks:a.status==='active'?tasks:[],currentPolicyVersion:ASSISTANT_POLICY_VERSION};
  if(a.subrole==='team_lead'&&a.status==='active'&&parseAssistantJson(a.capabilities_json,[]).includes('team_lead.review')){
   await requireRunnable(a,'team_lead.review');
   const [team]=await db.execute(`SELECT aa.subrole,aa.status,aa.group_status groupStatus,COUNT(w.id) taskCount,SUM(w.state='blocked') blockedCount FROM assistant_accounts aa LEFT JOIN assistant_work_items w ON w.account_id=aa.id AND w.state IN ('queued','leased','blocked') WHERE aa.agency_id=? GROUP BY aa.id ORDER BY aa.subrole`,[a.agency_id]);
   const [preparation]=await db.execute("SELECT aa.subrole,COUNT(j.id) preparingCount FROM assistant_accounts aa LEFT JOIN assistant_preparation_jobs j ON j.account_id=aa.id AND j.state IN ('queued','running') WHERE aa.agency_id=? GROUP BY aa.id",[a.agency_id]);
   const [checks]=await db.execute("SELECT aa.subrole,aa.baa_status,aa.privacy_policy_json,v.capability,v.outcome,v.policy_version policyVersion,v.configuration_hash configurationHash,v.build_id buildId FROM assistant_accounts aa LEFT JOIN assistant_verifications v ON v.account_id=aa.id WHERE aa.agency_id=?",[a.agency_id]);
   const [outcomes]=await db.execute("SELECT aa.subrole,r.ref runRef,r.outcome,r.started_at startedAt,r.completed_at completedAt,r.evidence_ciphertext evidenceCiphertext FROM assistant_accounts aa JOIN assistant_runs r ON r.account_id=aa.id WHERE aa.agency_id=? AND r.completed_at IS NOT NULL ORDER BY r.completed_at DESC",[a.agency_id]);
   const [assignments]=await db.execute("SELECT w.ref,aa.subrole,w.title,w.state status,w.priority,w.due_at dueAt FROM assistant_work_items w JOIN assistant_accounts aa ON aa.id=w.account_id WHERE w.agency_id=? AND w.state IN ('queued','leased','blocked') ORDER BY w.priority DESC,w.due_at,w.id LIMIT 100",[a.agency_id]);
   result.assignments=assignments;
   result.team=team.map(row=>{const last=safeRunSummary(outcomes.find(o=>o.subrole===row.subrole),a.agency_id);return {...row,preparingCount:Number(preparation.find(p=>p.subrole===row.subrole)?.preparingCount||0),availableCapabilities:(ASSISTANT_CATALOG.find(c=>c.key===row.subrole)?.capabilities||[]).map(c=>c.key),verification:checks.filter(c=>c.subrole===row.subrole&&c.capability).map(c=>{const current=c.policyVersion===ASSISTANT_POLICY_VERSION&&c.configurationHash===configurationHash(c);return {capability:c.capability,outcome:current?c.outcome:'NOT_RUN',recordedOutcome:c.outcome,current,policyVersion:c.policyVersion,buildId:c.buildId};}),lastOutcome:last?.outcome||null,lastStartedAt:last?.startedAt||null,lastCompletedAt:last?.completedAt||null,lastEvidenceComplete:last?.evidenceComplete??false,lastDurationSeconds:last?.durationSeconds??null};});
  }
  return result;
 }
 async function dispatch(userId){
  const lead=await accountForUser(userId);await requireRunnable(lead,'team_lead.dispatch');
  const {dispatchAssistantPreparation}=await import('./assistantPreparation.service.js');
  return dispatchAssistantPreparation(userId,{db,teams:{accountForUser,accountById},now:now()});
 }
 async function prioritizeWork(userId,ref,priority){
  const lead=await accountForUser(userId);await requireRunnable(lead,'team_lead.dispatch');
  if(!uuid(ref)||![0,1,2].includes(priority))throw assistantError(400,'INVALID_PRIORITY','Choose a task and bounded priority.');
  const [result]=await db.execute("UPDATE assistant_work_items SET priority=? WHERE ref=? AND agency_id=? AND state='queued'",[priority,ref,lead.agency_id]);
  if(!result.affectedRows)throw assistantError(404,'TASK_NOT_FOUND','No queued task in this agency matches.');return {updated:true};
 }
 async function requestRetest(userId,input){
  const lead=await accountForUser(userId);await requireRunnable(lead,'team_lead.review');
  const [targets]=await db.execute('SELECT id,subrole,agency_id FROM assistant_accounts WHERE agency_id=? AND subrole=?',[lead.agency_id,input.subrole]);const target=targets[0];
  if(!target||!['workflow_failure','privacy_boundary','stale_sources','missing_evidence'].includes(input.reasonCode))throw assistantError(400,'INVALID_RETEST_REQUEST','Choose an existing team role and retest reason.');
  assertAssistantCapabilities(target.subrole,[input.capability]);
  const c=await db.getConnection();try{await c.beginTransaction();await c.execute('SELECT id FROM assistant_accounts WHERE id=? FOR UPDATE',[target.id]);const [[existing]]=await c.execute("SELECT event_key FROM assistant_change_events WHERE account_id=? AND event_type='verification_requested' AND JSON_UNQUOTE(JSON_EXTRACT(changes_json,'$.verification.capability'))=? AND created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 DAY) ORDER BY id DESC LIMIT 1",[target.id,input.capability]);if(existing){await c.commit();return {requested:true,reused:true};}
   await recordAssistantChange(c,{accountId:target.id,agencyId:lead.agency_id,actorUserId:userId,eventType:'verification_requested',changes:{verification:{capability:input.capability,reasonCode:input.reasonCode}},reason:'The agency team lead requested owner-reviewed external retesting.'});await c.commit();return {requested:true};
  }catch(e){await c.rollback();throw e;}finally{c.release();}
 }
 async function currentRevision(a,w,executor=db){
  if(PAYROLL_REVIEW_KINDS[w.source_kind])return (await readPayrollReview({agencyId:a.agency_id,kind:w.source_kind,sourceId:w.source_id},executor)).sourceRevision;
  if(w.source_kind==='clinical_chart'){const r=await clinicalRevision({agencyId:Number(a.agency_id),clientId:Number(w.source_id),subrole:a.subrole,privacyPolicy:assertNarrativeRelease(a)},{mainDb:executor});return typeof r==='string'?r:r.sourceRevision;}
  if(w.source_kind==='marketing_page'){const {assistantMarketingSourceRevision}=await import('./assistantMarketing.service.js');return assistantMarketingSourceRevision(a,w.source_id,{db:executor});}
  return operationalRevision({agencyId:Number(a.agency_id),sourceKind:w.source_kind,sourceId:Number(w.source_id)},executor);
 }
 async function startTask(userId,ref){if(!uuid(ref))throw assistantError(404,'TASK_NOT_FOUND','Task not found.');const a=await accountForUser(userId);const [[w]]=await db.execute('SELECT * FROM assistant_work_items WHERE ref=? AND account_id=? AND agency_id=?',[ref,a.id,a.agency_id]);if(!w)throw assistantError(404,'TASK_NOT_FOUND','Task not found.');await requireRunnable(a,w.task_kind);const revision=await currentRevision(a,w);if(revision!==w.source_hash){await db.execute("UPDATE assistant_work_items SET state='stale' WHERE id=?",[w.id]);throw assistantError(409,'ASSISTANT_SOURCE_CHANGED','The source changed. A new packet is required.');}
  const c=await db.getConnection();try{await c.beginTransaction();const [[currentAccount]]=await c.execute('SELECT * FROM assistant_accounts WHERE id=? FOR UPDATE',[a.id]);assertUnchangedAssistantConfiguration(a,currentAccount);await requireRunnable(currentAccount,w.task_kind,c);await expireLeases(a,c);const [[locked]]=await c.execute('SELECT * FROM assistant_work_items WHERE id=? AND account_id=? AND agency_id=? FOR UPDATE',[w.id,a.id,a.agency_id]);if(!locked||locked.source_hash!==w.source_hash||await currentRevision(a,locked,c)!==locked.source_hash)throw assistantError(409,'ASSISTANT_SOURCE_CHANGED','The source changed. A new packet is required.');const [[active]]=await c.execute('SELECT r.*,w.ref work_ref FROM assistant_runs r JOIN assistant_work_items w ON w.id=r.work_id WHERE r.account_id=? AND r.completed_at IS NULL AND r.lease_expires_at>UTC_TIMESTAMP(3) ORDER BY r.id DESC LIMIT 1 FOR UPDATE',[a.id]);if(active){if(active.work_ref!==ref||locked.state!=='leased')throw assistantError(409,'ASSISTANT_ALREADY_WORKING','Finish the current task first.');await c.commit();return runResponse(a,locked,active);}
   if(locked.state!=='queued')throw assistantError(409,'TASK_NOT_AVAILABLE','This task is no longer available.');const runRef=assistantRef(),expires=new Date(now().getTime()+5*60000);const [r]=await c.execute('INSERT INTO assistant_runs(ref,work_id,account_id,agency_id,source_hash,lease_expires_at,heartbeat_at) VALUES (?,?,?,?,?,?,?)',[runRef,w.id,a.id,a.agency_id,locked.source_hash,expires,now()]);await c.execute("UPDATE assistant_work_items SET state='leased' WHERE id=?",[w.id]);await c.commit();return runResponse(a,locked,{ref:runRef,lease_expires_at:expires});
  }catch(e){await c.rollback();throw e;}finally{c.release();}
 }
 function runResponse(a,w,r){return {runRef:r.ref,leaseExpiresAt:r.lease_expires_at,taskVersion:ASSISTANT_POLICY_VERSION,sourceRevision:w.source_hash,packet:decrypt(w.packet_ciphertext,`assistant-work:${a.agency_id}:${a.id}:${w.ref}:packet`)};}
 async function heartbeat(userId,ref){const a=await accountForUser(userId);if(!uuid(ref))throw assistantError(404,'RUN_NOT_FOUND','Run not found.');const [[work]]=await db.execute('SELECT w.task_kind FROM assistant_runs r JOIN assistant_work_items w ON w.id=r.work_id WHERE r.ref=? AND r.account_id=? AND r.agency_id=?',[ref,a.id,a.agency_id]);if(!work)throw assistantError(404,'RUN_NOT_FOUND','Run not found.');await requireRunnable(a,work.task_kind);const [r]=await db.execute(`UPDATE assistant_runs r JOIN assistant_work_items w ON w.id=r.work_id SET r.heartbeat_at=UTC_TIMESTAMP(3),r.lease_expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE) WHERE r.ref=? AND r.account_id=? AND r.agency_id=? AND r.completed_at IS NULL AND r.lease_expires_at>UTC_TIMESTAMP(3) AND r.started_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 30 MINUTE) AND w.state='leased'`,[ref,a.id,a.agency_id]);if(!r.affectedRows)throw assistantError(409,'RUN_LEASE_EXPIRED','This run expired or changed. Reload the task list.');return {renewed:true};}
 async function completeRun(userId,ref,input){const a=await accountForUser(userId);if(!uuid(ref))throw assistantError(404,'RUN_NOT_FOUND','Run not found.');const [[run]]=await db.execute('SELECT r.*,w.ref work_ref,w.packet_ciphertext,w.source_kind,w.source_id,w.task_kind,w.state FROM assistant_runs r JOIN assistant_work_items w ON w.id=r.work_id WHERE r.ref=? AND r.account_id=? AND r.agency_id=?',[ref,a.id,a.agency_id]);if(!run)throw assistantError(404,'RUN_NOT_FOUND','Run not found.');await requireRunnable(a,run.task_kind);
  if(run.completed_at){const [[saved]]=await db.execute('SELECT ref FROM assistant_proposals WHERE run_id=?',[run.id]);return {completed:true,proposalRef:saved?.ref,outcome:run.outcome,reused:true};}
  if(run.state!=='leased'||new Date(run.lease_expires_at)<now()||now()-new Date(run.started_at)>30*60000)throw assistantError(409,'RUN_LEASE_EXPIRED','This run expired or changed.');
  if(input.sourceRevision!==run.source_hash||await currentRevision(a,run)!==run.source_hash){await db.execute("UPDATE assistant_work_items SET state='stale' WHERE id=?",[run.work_id]);throw assistantError(409,'ASSISTANT_SOURCE_CHANGED','The source changed. The recommendation was not applied.');}
  const packet=decrypt(run.packet_ciphertext,`assistant-work:${a.agency_id}:${a.id}:${run.work_ref}:packet`),result=normalizeAssistantResult(input,packetRefs(packet));const proposalRef=assistantRef();result.evidence.taskVersion=ASSISTANT_POLICY_VERSION;result.evidence.accountPolicyRevision=Number(a.policy_revision);
  if(run.source_kind==='marketing_page'){
   const [published]=await db.execute('SELECT ref,variant_key,rolled_back_at,created_at FROM assistant_marketing_revisions WHERE account_id=? AND page_id=? AND created_at>=? ORDER BY id LIMIT 101',[a.id,run.source_id,run.started_at]);
   result.evidence.publishedRevisions=published.slice(0,100).map(row=>({ref:row.ref,variantKey:row.variant_key,publishedAt:row.created_at,rolledBack:!!row.rolled_back_at}));
   result.evidence.publicationEvidenceTruncated=published.length>100;
  }
  const c=await db.getConnection();try{await c.beginTransaction();const [[currentAccount]]=await c.execute('SELECT * FROM assistant_accounts WHERE id=? FOR UPDATE',[a.id]);assertUnchangedAssistantConfiguration(a,currentAccount);await requireRunnable(currentAccount,run.task_kind,c);const [[locked]]=await c.execute('SELECT r.*,w.state,w.source_hash AS work_source_hash FROM assistant_runs r JOIN assistant_work_items w ON w.id=r.work_id WHERE r.id=? AND r.account_id=? AND r.agency_id=? FOR UPDATE',[run.id,a.id,a.agency_id]);if(!locked)throw assistantError(404,'RUN_NOT_FOUND','Run not found.');if(locked.completed_at){await c.rollback();return {completed:true,reused:true};}
   if(locked.state!=='leased'||locked.source_hash!==run.source_hash||locked.work_source_hash!==run.source_hash||new Date(locked.lease_expires_at)<now()||now()-new Date(locked.started_at)>30*60000||await currentRevision(a,run,c)!==run.source_hash)throw assistantError(409,'ASSISTANT_SOURCE_CHANGED','The task, source or lease changed. Reload before submitting findings.');
   await c.execute('INSERT INTO assistant_proposals(ref,work_id,run_id,account_id,agency_id,source_hash,payload_ciphertext) VALUES (?,?,?,?,?,?,?)',[proposalRef,run.work_id,run.id,a.id,a.agency_id,run.source_hash,encrypt(result,`assistant-proposal:${a.agency_id}:${proposalRef}`)]);
   await c.execute('UPDATE assistant_runs SET completed_at=UTC_TIMESTAMP(3),outcome=?,evidence_ciphertext=? WHERE id=?',[result.outcome,encrypt(result.evidence,`assistant-run:${a.agency_id}:${ref}`),run.id]);await c.execute("UPDATE assistant_work_items SET state=? WHERE id=?",[result.outcome==='BLOCKED'?'blocked':'completed',run.work_id]);await c.commit();
  }catch(e){await c.rollback();throw e;}finally{c.release();}return {completed:true,proposalRef,outcome:result.outcome};
 }
 async function listHumanReviews(actor,agencyId,filter={}){
  const id=Number(agencyId);if(!Number.isSafeInteger(id)||id<1)throw assistantError(400,'AGENCY_REQUIRED','Choose an agency.');
  const allowedKinds=['clinical_chart','task','payroll_time_claim','marketing_page','payroll_school_mileage','payroll_individual_supervision','payroll_supervision_monitor'];const selected=filter.sourceKind!==undefined||filter.sourceId!==undefined;if(selected&&(!allowedKinds.includes(filter.sourceKind)||!n(filter.sourceId)))throw assistantError(400,'INVALID_SOURCE_FILTER','Choose a valid source.');const [rows]=await db.execute('SELECT p.ref,p.agency_id,p.decision,p.created_at,w.source_id,w.task_kind,a.subrole FROM assistant_proposals p JOIN assistant_work_items w ON w.id=p.work_id JOIN assistant_accounts a ON a.id=p.account_id WHERE p.agency_id=?'+(selected?' AND w.source_kind=? AND w.source_id=?':'')+' ORDER BY p.id DESC LIMIT 100',selected?[id,filter.sourceKind,n(filter.sourceId)]:[id]);
  const {assertHumanAssistantReviewer}=await import('./assistantHumanReview.service.js');const result=[];
  for(const row of rows){try{await assertHumanAssistantReviewer(actor,row,db);result.push({ref:row.ref,subrole:row.subrole,decision:row.decision,createdAt:row.created_at});}catch(e){if(e.status!==403)throw e;}}
  return {proposals:result};
 }
 async function proposalForHuman(actor,ref){
  if(!uuid(ref))throw assistantError(404,'PROPOSAL_NOT_FOUND','Proposal not found.');
  const [[p]]=await db.execute('SELECT p.*,w.ref work_ref,w.mapping_ciphertext,w.source_kind,w.source_id,w.task_kind FROM assistant_proposals p JOIN assistant_work_items w ON w.id=p.work_id WHERE p.ref=?',[ref]);
  if(!p)throw assistantError(404,'PROPOSAL_NOT_FOUND','Proposal not found.');
  const {assertHumanAssistantReviewer}=await import('./assistantHumanReview.service.js');await assertHumanAssistantReviewer(actor,p,db);
  const a=await accountById(p.account_id);let fresh=false;try{fresh=await currentRevision(a,p)===p.source_hash;}catch{ /* Retain review history even when the source is unavailable. */ }
  const sourceMapping=decrypt(p.mapping_ciphertext,`assistant-work:${p.agency_id}:${a.id}:${p.work_ref}:mapping`);
  const subjects={};
  if(sourceMapping.clientId){const [[client]]=await db.execute('SELECT id,full_name FROM clients WHERE id=? AND agency_id=?',[sourceMapping.clientId,p.agency_id]);if(client)subjects.client={id:client.id,name:client.full_name};}
  if(sourceMapping.userId){const [[staff]]=await db.execute('SELECT u.id,u.first_name,u.last_name FROM users u JOIN user_agencies ua ON ua.user_id=u.id WHERE u.id=? AND ua.agency_id=?',[sourceMapping.userId,p.agency_id]);if(staff)subjects.staff={id:staff.id,name:[staff.first_name,staff.last_name].filter(Boolean).join(' ')};}
  return {ref:p.ref,agencyId:p.agency_id,agencySlug:a.agency_slug,subrole:a.subrole,decision:fresh?p.decision:'stale',sourceRevision:p.source_hash,fresh,result:decrypt(p.payload_ciphertext,`assistant-proposal:${p.agency_id}:${p.ref}`),sourceMapping,subjects};
 }
 async function reviewProposal(actor,ref,input){const p=await proposalForHuman(actor,ref);if(!p.fresh)throw assistantError(409,'ASSISTANT_SOURCE_CHANGED','Review the current source before accepting a recommendation.');if(!['accepted','dismissed','more_information'].includes(input.decision)||typeof input.reason!=='string'||input.reason.length<5||input.reason.length>1000)throw assistantError(400,'REVIEW_REASON_REQUIRED','Record a decision and reason.');await db.execute("UPDATE assistant_proposals SET decision=?,review_reason=?,reviewed_by_user_id=?,reviewed_at=UTC_TIMESTAMP(3) WHERE ref=? AND decision IN ('pending','more_information')",[input.decision,input.reason,actor.id,ref]);return {recorded:true,decision:input.decision,sourceRecordsChanged:false};}
 return {prioritizeWork,requestRetest,listHumanReviews,ownerOverview,patchAccount,verifyCapability,prepareAccount,workspace,dispatch,startTask,heartbeat,completeRun,proposalForHuman,reviewProposal,accountById,accountForUser};
}
const service=createAssistantTeamsService();export default service;
export async function queueAssistantSourceChange({agencyId,clientId,sourceKind,sourceId},db=pool){if(!n(agencyId)||!n(clientId)||!n(sourceId))return;await db.execute('INSERT INTO assistant_source_changes(agency_id,client_id,source_kind,source_id) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE changed_at=UTC_TIMESTAMP(3),processed_at=NULL',[agencyId,clientId,String(sourceKind).slice(0,50),sourceId]);}
