import pool from '../../config/database.js';
import { billingError, requireResponsiblePayer, auditBilling } from '../familyBillingPolicy.service.js';
import { encryptFamilyBilling, decryptFamilyBilling } from '../familyBillingEncryption.service.js';
import { normalizeShares, assertSharesAuthorized, parseJson, transaction } from './policy.js';
import { findReceivable, allocationsFor, allocateBalance } from './receivables.js';

export async function setStatementSharing({agencyId,clientId,guardianUserId,active,actorUserId,reason}) {
  if(!String(reason||'').trim())throw billingError(400,'Document the authority for sharing this billing statement');
  await requireResponsiblePayer(guardianUserId,clientId,agencyId);
  return transaction(async db=>{
    await db.execute(`INSERT INTO family_statement_shares (agency_id,client_id,guardian_user_id,active,evidence_encrypted,granted_by_user_id,revoked_at) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE active=VALUES(active),evidence_encrypted=VALUES(evidence_encrypted),granted_by_user_id=VALUES(granted_by_user_id),revoked_at=VALUES(revoked_at)`,[agencyId,clientId,guardianUserId,active?1:0,encryptFamilyBilling({reason:String(reason).slice(0,2000)},`statement-share:${agencyId}:${clientId}`),actorUserId,active?null:new Date()]);
    await auditBilling({agencyId,clientId,userId:actorUserId,action:active?'statement_sharing_granted':'statement_sharing_revoked',objectId:guardianUserId},db);
  });
}
export async function requestSplit({agencyId,receivableId,userId,shares,consent}) {
  const normalized=normalizeShares(shares);
  if(consent?.accepted!==true||!String(consent.signatureName||'').trim())throw billingError(400,'Confirm the proposed division of the remaining balance');
  return transaction(async db=>{
    const row=await findReceivable(agencyId,receivableId,db,true);await requireResponsiblePayer(userId,row.client_id,agencyId,db);await assertSharesAuthorized(agencyId,row.client_id,normalized,db);
    const allocations=await allocationsFor(row.id,db,true);
    if(!allocations.some(a=>Number(a.payer_user_id)===Number(userId)&&Number(a.amount_cents)>Number(a.paid_cents)))throw billingError(403,'Only a payer with an unpaid share can request a split');
    const [pending]=await db.execute("SELECT id FROM family_split_requests WHERE receivable_id=? AND status='pending'",[row.id]);if(pending.length)throw billingError(409,'A split request is already pending');
    const required=[...new Set([...normalized.map(s=>s.payerUserId),...allocations.filter(a=>Number(a.amount_cents)>Number(a.paid_cents)).map(a=>Number(a.payer_user_id)).filter(Boolean)])];
    const evidence={signatureName:String(consent.signatureName).slice(0,255),requiredUserIds:required,originalAllocations:allocations.map(a=>({id:a.id,amount:a.amount_cents,paid:a.paid_cents})),acceptedAt:new Date().toISOString()};
    const [result]=await db.execute('INSERT INTO family_split_requests (agency_id,receivable_id,requested_by_user_id,shares_json,accepted_user_ids_json,evidence_encrypted) VALUES (?,?,?,?,?,?)',[agencyId,row.id,userId,JSON.stringify(normalized),JSON.stringify([userId]),encryptFamilyBilling(evidence,`split:${agencyId}:${row.id}`)]);
    await auditBilling({agencyId,clientId:row.client_id,userId,action:'split_requested',objectId:result.insertId},db);return {requestId:result.insertId};
  });
}
export async function respondToSplit({agencyId,requestId,userId,accept,signatureName}) {
  if(accept&&!String(signatureName||'').trim())throw billingError(400,'Sign to accept your proposed share');
  return transaction(async db=>{
    const [lookup]=await db.execute('SELECT * FROM family_split_requests WHERE id=? AND agency_id=?',[requestId,agencyId]);if(!lookup.length)throw billingError(404,'Split request not found');
    const row=await findReceivable(agencyId,lookup[0].receivable_id,db,true);await requireResponsiblePayer(userId,row.client_id,agencyId,db);
    const [requests]=await db.execute('SELECT * FROM family_split_requests WHERE id=? FOR UPDATE',[requestId]);const request=requests[0];
    const evidence=decryptFamilyBilling(request.evidence_encrypted,`split:${agencyId}:${row.id}`);
    if(!evidence.requiredUserIds.includes(Number(userId)))throw billingError(403,'You are not a party to this split');
    if(request.status!=='pending')throw billingError(409,'This request is already resolved');
    if(!accept){await db.execute("UPDATE family_split_requests SET status='declined',resolved_at=CURRENT_TIMESTAMP WHERE id=?",[requestId]);await auditBilling({agencyId,clientId:row.client_id,userId,action:'split_declined',objectId:requestId},db);return {status:'declined'};}
    const allocations=await allocationsFor(row.id,db,true);
    if(JSON.stringify(allocations.map(a=>({id:a.id,amount:a.amount_cents,paid:a.paid_cents})))!==JSON.stringify(evidence.originalAllocations)){await db.execute("UPDATE family_split_requests SET status='cancelled',resolved_at=NOW() WHERE id=?",[requestId]);return {status:'cancelled',message:'The balance changed. Create a new split request.'};}
    const accepted=[...new Set([...parseJson(request.accepted_user_ids_json,[]).map(Number),Number(userId)])];
    evidence.signatures={...(evidence.signatures||{}),[userId]:{name:String(signatureName).slice(0,255),at:new Date().toISOString()}};
    const complete=evidence.requiredUserIds.every(id=>accepted.includes(id));
    if(complete)await allocateBalance({agencyId,receivableId:row.id,shares:parseJson(request.shares_json),actorUserId:userId},db);
    await db.execute('UPDATE family_split_requests SET accepted_user_ids_json=?,evidence_encrypted=?,status=?,resolved_at=? WHERE id=?',[JSON.stringify(accepted),encryptFamilyBilling(evidence,`split:${agencyId}:${row.id}`),complete?'accepted':'pending',complete?new Date():null,requestId]);
    await auditBilling({agencyId,clientId:row.client_id,userId,action:'split_response',objectId:requestId},db);return {status:complete?'accepted':'pending'};
  });
}
export async function listSplitRequests({agencyId,userId}) {
  const [rows]=await pool.execute("SELECT s.*,r.client_id FROM family_split_requests s JOIN family_receivables r ON r.id=s.receivable_id WHERE s.agency_id=? AND s.status='pending' ORDER BY s.id DESC LIMIT 100",[agencyId]);
  const result=[];for(const row of rows){const evidence=decryptFamilyBilling(row.evidence_encrypted,`split:${agencyId}:${row.receivable_id}`);if(!evidence.requiredUserIds.includes(Number(userId)))continue;try{await requireResponsiblePayer(userId,row.client_id,agencyId);}catch(e){if(e.status===403)continue;throw e;}result.push({id:row.id,receivableId:row.receivable_id,clientId:row.client_id,shares:parseJson(row.shares_json),acceptedUserIds:parseJson(row.accepted_user_ids_json),requestedByUserId:row.requested_by_user_id});}return result;
}
