import crypto from 'node:crypto';
import { snapshotServiceTerms, assertServiceTermsCurrent } from './serviceRates.js';
import pool from '../../config/database.js';
import Cards from '../../models/GuardianPaymentCard.model.js';
import { billingError, positiveId, requireBillingLink, requirePaymentAuthorizationLink, TUTORING_BILLING_TERMS, TUTORING_BILLING_TERMS_VERSION, resolveBillingTerms, auditBilling, recordBillingConsent } from '../familyBillingPolicy.service.js';
import { encryptFamilyBilling, decryptFamilyBilling } from '../familyBillingEncryption.service.js';
import { readClientInsurance } from '../clientInsurance.service.js';
import { hasMedicaidCoverage } from '../../utils/insurancePaymentPolicy.js';
import { transaction, parseJson } from './policy.js';

export const tokenHash = token => crypto.createHash('sha256').update(String(token)).digest('hex');
export function validToken(token){if(!/^[a-f0-9]{64}$/.test(String(token)))throw billingError(404,'Payment task not found');return token;}
export async function createPaymentTask({agencyId,guardianUserId,clientIds,actorUserId,requireCard=true,waiverText='',serviceTerms=[],fromPortal=false},connection=null){
  const ids=[...new Set((clientIds||[]).map(positiveId))];if(!ids.length||ids.length>30)throw billingError(400,'Select the clients covered by this authorization');
  const token=crypto.randomBytes(32).toString('hex'),expires=new Date(Date.now()+30*86400000);
  return transaction(async db=>{
    const access=new Map();
    for(const id of ids){access.set(id,await (requireCard?requireBillingLink:requirePaymentAuthorizationLink)(guardianUserId,id,agencyId,db));if(requireCard&&hasMedicaidCoverage(await readClientInsurance(id,agencyId,db)))throw billingError(409,'Do not require a payment card for Medicaid-covered clients. Use an authorization-only task or review a specific nonclinical service.');}
    const terms = await snapshotServiceTerms({agencyId,clientIds:ids,serviceTerms},db);
    const profileTerms=await Promise.all(ids.map(clientId=>access.get(clientId)?.tutoringAuthorizationOnly?{terms:TUTORING_BILLING_TERMS,termsVersion:TUTORING_BILLING_TERMS_VERSION}:resolveBillingTerms({userId:guardianUserId,agencyId,clientId},db)));
    if(profileTerms.some(t=>t.termsVersion!==profileTerms[0].termsVersion))throw billingError(400,'Assign separate payment authorizations for tutoring and clinical services.');
    const reusable=fromPortal===true && ids.length===1 && !terms.length && !waiverText;
    if(reusable){
      const [pending]=await db.execute(`SELECT t.id,t.waiver_encrypted,t.expires_at,n.id AS noticeId
        FROM family_billing_tasks t JOIN family_collections_notices n ON n.agency_id=t.agency_id AND n.idempotency_key=CONCAT('setup-task:',t.id)
        WHERE t.agency_id=? AND t.guardian_user_id=? AND t.status='pending' AND t.expires_at>CURRENT_TIMESTAMP
        AND t.require_card=? AND t.terms_version=? AND JSON_LENGTH(t.client_ids_json)=1 AND JSON_CONTAINS(t.client_ids_json,CAST(? AS JSON))
        ORDER BY t.id DESC FOR UPDATE`,[agencyId,guardianUserId,requireCard?1:0,profileTerms[0].termsVersion,JSON.stringify(ids[0])]);
      for(const prior of pending){
        const saved=decryptFamilyBilling(prior.waiver_encrypted,`billing-task:${agencyId}:${guardianUserId}`);
        if(saved.portalAssignment)return {taskId:prior.id,expiresAt:prior.expires_at,noticeId:prior.noticeId};
      }
    }
    const waiver={portalAssignment:reusable,serviceTerms:terms,terms:profileTerms[0].terms,additionalTerms:String(waiverText).trim().slice(0,12000),version:profileTerms[0].termsVersion};
    const [r]=await db.execute('INSERT INTO family_billing_tasks (agency_id,guardian_user_id,client_ids_json,token_hash,expires_at,require_card,terms_version,waiver_encrypted,created_by_user_id) VALUES (?,?,?,?,?,?,?,?,?)',[agencyId,guardianUserId,JSON.stringify(ids),tokenHash(token),expires,requireCard?1:0,waiver.version,encryptFamilyBilling(waiver,`billing-task:${agencyId}:${guardianUserId}`),actorUserId]);
    await auditBilling({agencyId,userId:actorUserId,action:'payment_task_created',objectId:r.insertId},db);
    return {taskId:r.insertId,token,expiresAt:expires};
  },connection);
}
async function ownedTask({userId,token,taskId,agencyId},db=pool,lock=false){
  let rows;
  if(token){validToken(token);[rows]=await db.execute(`SELECT * FROM family_billing_tasks WHERE token_hash=? AND guardian_user_id=?${lock?' FOR UPDATE':''}`,[tokenHash(token),userId]);}
  else [rows]=await db.execute(`SELECT * FROM family_billing_tasks WHERE id=? AND agency_id=? AND guardian_user_id=?${lock?' FOR UPDATE':''}`,[positiveId(taskId),positiveId(agencyId),userId]);
  const task=rows[0];if(!task||task.status==='cancelled')throw billingError(404,'Payment task not found for this account');
  if(task.status!=='completed'&&new Date(task.expires_at)<=new Date())throw billingError(410,'This payment task expired. Ask the office for a new invitation.');
  for(const id of parseJson(task.client_ids_json,[]))await (task.require_card?requireBillingLink:requirePaymentAuthorizationLink)(userId,id,task.agency_id,db);
  return task;
}
export async function getPaymentTask(input){
  const task=await ownedTask(input),[agency]=await pool.execute('SELECT name,slug,logo_url,color_palette FROM agencies WHERE id=?',[task.agency_id]);
  const ids=parseJson(task.client_ids_json);
  const [clients]=await pool.query("SELECT id AS clientId, COALESCE(NULLIF(full_name,''),initials) AS clientName FROM clients WHERE id IN (?)",[ids]);
  return {id:task.id,agencyId:task.agency_id,agency:agency[0],clientIds:ids,clients,title:task.title,status:task.status,requireCard:!!task.require_card,expiresAt:task.expires_at,waiver:decryptFamilyBilling(task.waiver_encrypted,`billing-task:${task.agency_id}:${input.userId}`)};
}
export async function listPaymentTasks({userId,agencyId,staff=false}){
  const [rows]=await pool.execute(`SELECT id,agency_id AS agencyId,guardian_user_id AS guardianUserId,title,status,expires_at AS expiresAt,completed_at AS completedAt,client_ids_json,waiver_encrypted FROM family_billing_tasks WHERE agency_id=?${staff?'':' AND guardian_user_id=?'} ORDER BY id DESC LIMIT 100`,staff?[agencyId]:[agencyId,userId]);
  for(const row of rows){row.clientIds=parseJson(row.client_ids_json,[]);row.serviceTerms=(decryptFamilyBilling(row.waiver_encrypted,`billing-task:${row.agencyId}:${row.guardianUserId}`).serviceTerms||[]).map(({insuranceFingerprint,evidence,...term})=>term);delete row.client_ids_json;delete row.waiver_encrypted;}
  if(staff)return rows;
  const allowed=[];for(const row of rows){try{await ownedTask({userId,agencyId,taskId:row.id});allowed.push(row);}catch(e){if(![403,404,410].includes(e.status))throw e;}}return allowed;
}
export async function authorizePaymentTask(input){
  return transaction(async db=>{
    const task=await ownedTask(input,db,true);if(task.status!=='pending')throw billingError(409,'This task is already completed');
    if(input.consent?.waiverAccepted!==true)throw billingError(400,'Accept the complete authorization, including the organization’s terms');
    await assertServiceTermsCurrent(decryptFamilyBilling(task.waiver_encrypted,`billing-task:${task.agency_id}:${input.userId}`).serviceTerms,task.agency_id,db);
    for(const clientId of parseJson(task.client_ids_json)){
      await recordBillingConsent({...input,agencyId:task.agency_id,clientId,purpose:'responsible_payer'},db);
      await db.execute("INSERT INTO client_billing_payers (agency_id,client_id,guardian_user_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE status='active'",[task.agency_id,clientId,input.userId]);
    }
    await auditBilling({agencyId:task.agency_id,userId:input.userId,action:'payment_task_authorized',objectId:task.id},db);
    return {authorized:true,agencyId:task.agency_id};
  });
}
export async function completePaymentTask(input){
  return transaction(async db=>{
    const task=await ownedTask(input,db,true);if(task.status==='completed')return {completed:true,alreadyCompleted:true};
    if(input.consent?.waiverAccepted!==true)throw billingError(400,'Accept the complete authorization');
    let card=null;
    if(task.require_card||input.cardId){
      for(const clientId of parseJson(task.client_ids_json))await requireBillingLink(input.userId,clientId,task.agency_id,db);
      const cards=await Cards.findActiveByGuardian(input.userId,task.agency_id,db);card=cards.find(c=>Number(c.id)===Number(input.cardId));
      const [account]=await db.execute("SELECT stripe_connect_account_id FROM agency_billing_accounts WHERE agency_id=? AND stripe_connect_status='active'",[task.agency_id]);
      if(!card?.stripe_payment_method_id||card.legacyRequiresReview||!card.connected_account_id||card.connected_account_id!==account[0]?.stripe_connect_account_id)throw billingError(409,'Verify and select your card for this organization');
    }
    await assertServiceTermsCurrent(decryptFamilyBilling(task.waiver_encrypted,`billing-task:${task.agency_id}:${input.userId}`).serviceTerms,task.agency_id,db);
    for(const clientId of parseJson(task.client_ids_json)){
      if(task.require_card&&hasMedicaidCoverage(await readClientInsurance(clientId,task.agency_id,db)))throw billingError(409,'Coverage changed. Ask the office for an authorization-only task.');
      await recordBillingConsent({...input,agencyId:task.agency_id,clientId,cardId:card?.id||null,purpose:'responsible_payer'},db);
      await db.execute("INSERT INTO client_billing_payers (agency_id,client_id,guardian_user_id,payment_card_id) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE status='active',payment_card_id=COALESCE(VALUES(payment_card_id),payment_card_id)",[task.agency_id,clientId,input.userId,card?.id||null]);
    }
    const evidence={waiver:decryptFamilyBilling(task.waiver_encrypted,`billing-task:${task.agency_id}:${input.userId}`),clientIds:parseJson(task.client_ids_json),cardId:card?.id||null,signatureName:String(input.consent.signatureName).trim(),signedAt:new Date().toISOString(),ip:String(input.ip||'').slice(0,80),userAgent:String(input.userAgent||'').slice(0,500),recurringAuthorized:false};
    await db.execute("UPDATE family_billing_tasks SET status='completed',completed_at=CURRENT_TIMESTAMP,signed_evidence_encrypted=? WHERE id=?",[encryptFamilyBilling(evidence,`billing-task:${task.agency_id}:${input.userId}`),task.id]);
    await auditBilling({agencyId:task.agency_id,userId:input.userId,action:'payment_task_completed',objectId:task.id},db);return {completed:true};
  });
}
export async function cancelPaymentTask({agencyId,taskId,actorUserId}){await pool.execute("UPDATE family_billing_tasks SET status='cancelled' WHERE id=? AND agency_id=? AND status='pending'",[taskId,agencyId]);await auditBilling({agencyId,userId:actorUserId,action:'payment_task_cancelled',objectId:taskId});}
