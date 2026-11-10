import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import {encryptFamilyBilling,decryptFamilyBilling} from './familyBillingEncryption.service.js';
import {assistantError,assistantRef,parseAssistantJson,ASSISTANT_AGENCIES} from './assistantTeamPolicy.js';
import {assertAssistantOwner} from './assistantProvisioning.service.js';
import {assertAssistantExecution} from './assistantExecutionPolicy.service.js';
import {resolveClaimMdConnection} from './claimMdConnection.service.js';
import {invokeAssistantBillingSubmission} from './assistantBillingCommand.service.js';
import {getMedicalBillingFlags} from './medicalBillingFlags.service.js';

export const BILLING_BOT_INSTRUCTIONS=Object.freeze([
 'Act only as the Billing Assistant for the company assigned to your account.',
 'Work only on a batch explicitly requested by Michael under the active numbered authorization rule. Never schedule or initiate payer submissions yourself.',
 'View only opaque claim references, the rule and its authorization, and server-verified readiness checks. Do not open client charts, names, birth dates, member IDs, insurance cards, notes, diagnoses, payer/provider identifiers, or raw claim payloads.',
 'Confirm the displayed rule number, revision, authorizer, company, batch expiration and READY status for every item before submitting.',
 'Submit only the opaque references in that authorized batch. The server must recheck current signatures, documentation, insurance identity and coordination, provider/payer mapping, AI review, claim data and duplicate protections immediately before transmission.',
 'Do not edit claims, alter codes or amounts, sign or cosign notes, attest to clinical or coverage reviews, override warnings, or prepare retries, replacements or voids.',
 'Skip any changed, stale, unready, already-sent or rejected item. Flag the issue as an urgent to-do for staff with billing permissions in that company.',
 'Record each result and the authorization line: Authorized by Michael Mendez under rule # and revision; performed by Billing Assistant.',
 'Distinguish Claim.MD acknowledgement from payer acceptance and payment. On an uncertain upload, stop the batch, flag reconciliation and never retry automatically.'
]);
const number=id=>`BILL-${String(id).padStart(6,'0')}`;
const uuid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/i.test(value);
const fail=(code,message)=>assistantError(409,code,message);
export function billingAssistantReady(p){return p?.claim?.claim_lifecycle==='ready'&&!p.claim.claimmd_claim_id&&!p.claim.claimmd_submitted_at
 &&p.readiness?.ready===true&&p.aiReview?.status==='passed'&&!(p.aiReview.findings||[]).some(f=>!f.resolution)&&!!p.reviewHash;}
export function publicBillingRule(row){return {id:Number(row.id),ruleNumber:number(row.id),revision:Number(row.revision),status:row.status,
 authorizedBy:row.authorized_by_name,authorizedAt:row.authorized_at,agencyIds:parseAssistantJson(row.agency_ids_json,[]),trigger:'owner_requested_batch',instructions:parseAssistantJson(row.instructions_json,[]) };}

export function createAssistantBillingSubmission(deps={}){
 const db=deps.db||pool,clinical=deps.clinical||clinicalPool,now=deps.now||(()=>new Date()),encrypt=deps.encrypt||encryptFamilyBilling,decrypt=deps.decrypt||decryptFamilyBilling;
 const owner=deps.owner||assertAssistantOwner,execute=deps.execute||assertAssistantExecution,connection=deps.connection||resolveClaimMdConnection;
 const prepare=deps.prepare|| (async(...args)=>(await import('../controllers/claimMdWorkflow.controller.js')).prepareClaimReview(...args));
 const invoke=deps.invoke|| (async input=>invokeAssistantBillingSubmission(input,(await import('../controllers/medicalBilling.controller.js')).submitClaimToClaimMd));
 async function company(agencyId){const[[a]]=await db.execute('SELECT feature_flags FROM agencies WHERE id=? AND is_active=1 AND COALESCE(is_archived,0)=0',[agencyId]);if(!a||!getMedicalBillingFlags(a).medicalBillingEnabled)throw fail('BILLING_COMPANY_DISABLED','Billing is not enabled for this company.');return a;}
 async function account(userId){const[[a]]=await db.execute("SELECT * FROM assistant_accounts WHERE user_id=? AND subrole='billing'",[userId]);if(!a)throw assistantError(403,'BILLING_ASSISTANT_REQUIRED','This duty belongs to the Billing Assistant.');await execute(a,'billing.submit_ready',db);return a;}
 async function rule(id){const[[r]]=await db.execute('SELECT * FROM assistant_billing_rules WHERE id=?',[id]);if(!r||r.status!=='active')throw fail('BILLING_RULE_INACTIVE','This billing authorization is not active.');await owner({id:r.authorized_by_user_id},db);return r;}
 async function rules(actor){await owner(actor,db);const[rows]=await db.execute('SELECT * FROM assistant_billing_rules ORDER BY id DESC');return {rules:rows.map(publicBillingRule),instructions:BILLING_BOT_INSTRUCTIONS};}
 async function authorize(actor,input={}){
  const authorized=await owner(actor,db);if(Object.keys(input).some(k=>k!=='agencyIds'))throw assistantError(400,'BILLING_RULE_INPUT','Only the company scope may be selected.');
  const ids=[...new Set((input.agencyIds||ASSISTANT_AGENCIES).map(Number))];if(!ids.length||ids.some(id=>!ASSISTANT_AGENCIES.includes(id)))throw assistantError(400,'BILLING_RULE_SCOPE','Choose ITSCO, Next Level Up or Inner Strength.');
  const[existing]=await db.execute("SELECT * FROM assistant_billing_rules WHERE authorized_by_user_id=? AND status='active' ORDER BY id DESC",[authorized.id]);
  const reused=existing.find(row=>JSON.stringify([...parseAssistantJson(row.agency_ids_json,[])].sort())===JSON.stringify([...ids].sort())&&JSON.stringify(parseAssistantJson(row.instructions_json,[]))===JSON.stringify(BILLING_BOT_INSTRUCTIONS));if(reused)return publicBillingRule(reused);
  const[[person]]=await db.execute('SELECT first_name,last_name FROM users WHERE id=?',[authorized.id]);
  const[r]=await db.execute('INSERT INTO assistant_billing_rules (authorized_by_user_id,authorized_by_name,agency_ids_json,instructions_json) VALUES (?,?,?,?)',[authorized.id,[person?.first_name,person?.last_name].filter(Boolean).join(' ')||'Michael Mendez',JSON.stringify(ids),JSON.stringify(BILLING_BOT_INSTRUCTIONS)]);
  return publicBillingRule(await rule(r.insertId));
 }
 async function revoke(actor,id){await owner(actor,db);await db.execute("UPDATE assistant_billing_rules SET status='revoked',revoked_at=UTC_TIMESTAMP(3) WHERE id=? AND status='active'",[id]);return {revoked:true};}
 async function createBatch(actor,id,input){
  const requester=await owner(actor,db),r=await rule(id),agencyId=Number(input?.agencyId);
  if(Object.keys(input||{}).some(k=>k!=='agencyId')||!parseAssistantJson(r.agency_ids_json,[]).includes(agencyId))throw assistantError(403,'BILLING_RULE_SCOPE','This company is outside the rule.');
  await company(agencyId);
  const[[a]]=await db.execute("SELECT * FROM assistant_accounts WHERE agency_id=? AND subrole='billing'",[agencyId]);
  if(!a)throw fail('BILLING_ACCOUNT_SETUP_REQUIRED','Prepare this company’s Billing Assistant account before starting a batch.');await execute(a,'billing.submit_ready',db);
  const conn=await connection(agencyId);if(conn.mode!=='live')throw fail('BILLING_CONNECTION_NOT_LIVE','The company’s live connection must be verified.');
  const[claims]=await clinical.execute(`SELECT id FROM clinical_claims WHERE agency_id=? AND is_deleted=0 AND claim_lifecycle='ready' AND claimmd_claim_id IS NULL AND claimmd_submitted_at IS NULL
   AND date_of_service<=? AND COALESCE(JSON_EXTRACT(metadata_json,'$.hiddenFromQueue'),false)=false ORDER BY id LIMIT 100`,[agencyId,new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(now())]);
  const items=[];let held=0;
  for(const claim of claims){if(items.length===25)break;try{const p=await prepare(agencyId,claim.id);if(!billingAssistantReady(p)){held++;continue;}items.push({ref:assistantRef(),claimId:Number(claim.id),clientId:Number(p.claim.client_id),reviewHash:p.reviewHash});}catch{held++;}}
  if(!items.length)return {prepared:false,readyCount:0,heldCount:held,rule:publicBillingRule(r)};
  const ref=assistantRef(),expires=new Date(now().getTime()+30*60000);
  await db.execute('INSERT INTO assistant_billing_batches (ref,rule_id,rule_revision,account_id,account_revision,agency_id,requested_by_user_id,requested_by_name,packet_encrypted,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
   [ref,r.id,r.revision,a.id,a.policy_revision,agencyId,requester.id,r.authorized_by_name,encrypt({items},`assistant-billing:${agencyId}:${ref}`),expires]);
  return {prepared:true,batchRef:ref,readyCount:items.length,heldCount:held,expiresAt:expires,rule:publicBillingRule(r)};
 }
 async function batches(userId){const a=await account(userId);const[rows]=await db.execute("SELECT * FROM assistant_billing_batches WHERE account_id=? AND agency_id=? AND state='prepared' AND expires_at>UTC_TIMESTAMP(3) ORDER BY id",[a.id,a.agency_id]);const results=[];
  for(const b of rows){let r;try{r=await rule(b.rule_id);}catch{continue;}if(Number(r.revision)!==Number(b.rule_revision)||Number(a.policy_revision)!==Number(b.account_revision))continue;
   const packet=decrypt(b.packet_encrypted,`assistant-billing:${a.agency_id}:${b.ref}`),attempted=new Set(parseAssistantJson(b.results_json,[]).map(result=>result.ref));
   const current=[];for(const item of packet.items.filter(item=>!attempted.has(item.ref))){try{const p=await prepare(a.agency_id,item.claimId);if(billingAssistantReady(p)&&p.reviewHash===item.reviewHash)current.push(item);}catch{/* A stale or unready claim is never shown to the assistant. */}}
   if(current.length)results.push({ref:b.ref,rule:publicBillingRule(r),expiresAt:b.expires_at,requestedBy:b.requested_by_name,items:current.map(i=>({ref:i.ref,status:'READY',checks:{clinicalSignatures:true,documentation:true,coverage:true,providerMapping:true,aiConsistency:true,claimData:true,neverSubmitted:true}}))});
  }return {batches:results};
 }
 async function submit(userId,ref,input){
  if(!uuid(ref)||!input||typeof input!=='object'||Object.keys(input).some(k=>!['ruleNumber','ruleRevision','itemRefs'].includes(k)))throw assistantError(400,'BILLING_BATCH_INPUT','Use the displayed batch and its opaque references.');
  const a=await account(userId),[[b]]=await db.execute('SELECT * FROM assistant_billing_batches WHERE ref=? AND account_id=? AND agency_id=?',[ref,a.id,a.agency_id]);
  if(!b)throw assistantError(404,'BILLING_BATCH_NOT_FOUND','Batch not found.');
  const r=await rule(b.rule_id);
  if(Number(r.revision)!==Number(b.rule_revision)||Number(a.policy_revision)!==Number(b.account_revision)||new Date(b.expires_at)<=now())throw fail('BILLING_BATCH_STALE','This batch changed or expired. Ask Michael for a new batch.');
  if(input.ruleNumber!==number(r.id)||Number(input.ruleRevision)!==Number(r.revision))throw fail('BILLING_RULE_CHANGED','Confirm the currently displayed rule.');
  const packet=decrypt(b.packet_encrypted,`assistant-billing:${a.agency_id}:${ref}`),refs=input.itemRefs,previousResults=parseAssistantJson(b.results_json,[]),attempted=new Set(previousResults.map(result=>result.ref));
  if(!Array.isArray(refs)||!refs.length||new Set(refs).size!==refs.length||refs.some(v=>!packet.items.some(i=>i.ref===v)))throw assistantError(400,'BILLING_ITEM_SCOPE','Choose only opaque references in this batch.');
  if(b.state==='completed')return {results:previousResults.filter(result=>refs.includes(result.ref)),remainingCount:0,reused:true};
  if(b.state!=='prepared')throw fail('BILLING_BATCH_RECONCILE','This batch was already started. Reconcile its recorded results before any new submission.');
  const pendingItems=packet.items.filter(item=>!attempted.has(item.ref));
  if(refs.some(v=>attempted.has(v)))throw assistantError(400,'BILLING_ITEM_SCOPE','Choose only unsubmitted opaque references in this batch.');
  // The result count also protects a request that read the batch before another
  // individual submission finished and made its remaining items available again.
  const[reserved]=await db.execute("UPDATE assistant_billing_batches SET state='processing' WHERE id=? AND state='prepared' AND COALESCE(JSON_LENGTH(results_json),0)=?",[b.id,previousResults.length]);if(!reserved.affectedRows)throw fail('BILLING_BATCH_RECONCILE','This batch changed or is already being processed. Refresh its recorded results.');
  const results=[...previousResults];let uncertain=false;
  for(const item of pendingItems.filter(i=>refs.includes(i.ref))){
   let authorization;
   try{
    const currentRule=await rule(r.id),current=await account(userId);
    await company(a.agency_id);
    if(Number(currentRule.revision)!==Number(b.rule_revision)||Number(current.policy_revision)!==Number(b.account_revision))throw fail('BILLING_RULE_CHANGED','Rule or assistant configuration changed.');
    const p=await prepare(a.agency_id,item.claimId);if(!billingAssistantReady(p)||p.reviewHash!==item.reviewHash)throw fail('BILLING_SOURCE_CHANGED','The claim changed or no longer passes its checks.');
    authorization={ruleId:Number(r.id),ruleNumber:number(r.id),ruleRevision:Number(r.revision),authorizedByUserId:Number(r.authorized_by_user_id),authorizedByName:r.authorized_by_name,authorizedAt:r.authorized_at,
     requestedByUserId:Number(b.requested_by_user_id),requestedByName:b.requested_by_name,batchRef:ref,performedByUserId:Number(a.user_id),performedByAccountId:Number(a.id),performedByName:'Billing Assistant',trigger:'owner_requested_batch'};
    const conn=await connection(a.agency_id);if(conn.mode!=='live')throw fail('BILLING_CONNECTION_CHANGED','Live connection is unavailable.');
    const validate=async()=>{const latestRule=await rule(r.id),latestAccount=await account(userId);await company(a.agency_id);if(Number(latestRule.revision)!==Number(b.rule_revision)||Number(latestAccount.policy_revision)!==Number(b.account_revision))throw fail('BILLING_RULE_CHANGED','Authorization changed before transmission.');};
    const response=await invoke({account:current,claimId:item.claimId,reviewHash:p.reviewHash,mode:conn.mode,authorization,validate});
    if(response?.accepted!==true||response?.practice===true)throw fail('BILLING_RESPONSE_REQUIRES_REVIEW','Claim.MD returned an issue requiring billing review.');
    results.push({ref:item.ref,status:'CLAIMMD_ACKNOWLEDGED',ruleNumber:number(r.id),performedBy:'Billing Assistant',authorizedBy:r.authorized_by_name});
   }catch(error){
    const[[claim]]=await clinical.execute('SELECT client_id,claim_lifecycle FROM clinical_claims WHERE id=? AND agency_id=?',[item.claimId,a.agency_id]);uncertain=claim?.claim_lifecycle==='queued';
    const queue=deps.queueIssue|| (async input=>(await import('./dailyClaimAutomation.service.js')).queueAutomaticClaimIssue(input));
    const[[agency]]=await db.execute('SELECT feature_flags FROM agencies WHERE id=?',[a.agency_id]);
    await queue({agencyId:a.agency_id,claimId:item.claimId,clientId:claim?.client_id||item.clientId,userId:a.user_id,taskListId:parseAssistantJson(agency?.feature_flags).insuranceVerificationTasks?.taskListId,blockers:[error.message]});
    results.push({ref:item.ref,status:uncertain?'RECONCILIATION_REQUIRED':'HELD_FOR_BILLING',ruleNumber:number(r.id)});
   }
   await db.execute('UPDATE assistant_billing_batches SET results_json=? WHERE id=?',[JSON.stringify(results),b.id]);if(uncertain)break;
  }
  const attemptedAfter=new Set(results.map(result=>result.ref)),remainingCount=packet.items.filter(item=>!attemptedAfter.has(item.ref)).length;
  const state=uncertain?'reconciliation_required':remainingCount?'prepared':'completed';
  await db.execute("UPDATE assistant_billing_batches SET state=?,results_json=?,completed_at=IF(?='prepared',NULL,UTC_TIMESTAMP(3)) WHERE id=?",[state,JSON.stringify(results),state,b.id]);
  return {results:results.slice(previousResults.length),remainingCount,reconciliationRequired:uncertain};
 }
 return {rules,authorize,revoke,createBatch,batches,submit};
}
export default createAssistantBillingSubmission();
