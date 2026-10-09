import {isStaffCommunicationRole} from '../utils/staffCommunicationChoices.js';
import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import User from '../models/User.model.js';
import {hasSchedulingBillingAccess} from './schedulingBillingAccess.service.js';
import {encryptChatText,decryptChatText,isChatEncryptionConfigured} from './chatEncryption.service.js';
import {appendSecurityEvidence} from './securityEvidence.service.js';
import {randomUUID} from 'node:crypto';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const json=v=>typeof v==='string'?JSON.parse(v):(v||{});
const deps={main:pool,clinical:clinicalPool,billingAccess:hasSchedulingBillingAccess,memberships:id=>User.getAgencies(id),encrypt:encryptChatText,decrypt:decryptChatText,encryptionReady:isChatEncryptionConfigured,evidence:appendSecurityEvidence};
async function access(user,row,d){
 if(!user?.id||!isStaffCommunicationRole(user.role)||!row?.agency_id||!row?.client_id)throw fail('A linked client call is required.',404);
 if(user.auricwellPreviewAgencyId&&Number(user.auricwellPreviewAgencyId)!==Number(row.agency_id))throw fail('Call not found.',404);
 if(await d.billingAccess(user,row.agency_id))return true;
 const agencies=await d.memberships(user.id);
 if(!agencies.some(a=>Number(a.id)===Number(row.agency_id))||Number(row.user_id)!==Number(user.id))throw fail('Call not found.',404);
 const [assigned]=await d.main.execute(`SELECT c.id FROM clients c WHERE c.id=? AND c.agency_id=?
   AND (c.provider_id=? OR EXISTS(SELECT 1 FROM client_provider_assignments a WHERE a.client_id=c.id AND a.provider_user_id=? AND a.is_active=1))`,[row.client_id,row.agency_id,user.id,user.id]);
 if(!assigned.length)throw fail('Call not found.',404);
 return false;
}
async function present(row,canReview,d){
 const stored=json(row.metadata).billingReview;
 const details=stored?.envelope?JSON.parse(d.decrypt(stored.envelope)):null;
 let claim=null;
 if(stored?.claimId){const [rows]=await d.clinical.execute('SELECT id,claim_lifecycle FROM clinical_claims WHERE id=? AND agency_id=? AND client_id=? AND is_deleted=0',[stored.claimId,row.agency_id,row.client_id]);claim=rows[0]||null;}
 const billed=['submitted','accepted','paid','partially_paid','denied'].includes(String(claim?.claim_lifecycle));
 return {callId:row.id,agencyId:row.agency_id,clientId:row.client_id,providerId:row.user_id,direction:row.direction,startedAt:row.started_at||row.created_at,durationSeconds:row.duration_seconds,
   revision:stored?.revision||0,status:billed?'billed':stored?.status||'not_requested',details,claimId:stored?.claimId||null,claimStatus:claim?.claim_lifecycle||(stored?.claimId?'unavailable':null),canReview};
}
export async function getCallBillingReview(user,id,d=deps){
 if(!Number.isSafeInteger(Number(id))||Number(id)<1)throw fail('Invalid call.',400);
 const [rows]=await d.main.execute('SELECT cl.* FROM call_logs cl JOIN clients c ON c.id=cl.client_id AND c.agency_id=cl.agency_id WHERE cl.id=?',[id]);
 const row=rows[0];const canReview=await access(user,row,d);return present(row,canReview,d);
}
export async function listCallBillingReviews(user,agencyId,d=deps){
 if(!Number.isSafeInteger(Number(agencyId))||Number(agencyId)<1||!await d.billingAccess(user,Number(agencyId)))throw fail('Billing access is required.',403);
 if(user.auricwellPreviewAgencyId&&Number(user.auricwellPreviewAgencyId)!==Number(agencyId))throw fail('Organization access denied.',403);
 const [rows]=await d.main.execute(`SELECT cl.* FROM call_logs cl JOIN clients c ON c.id=cl.client_id AND c.agency_id=cl.agency_id
   WHERE cl.agency_id=? AND JSON_EXTRACT(cl.metadata,'$.billingReview') IS NOT NULL
   ORDER BY cl.updated_at DESC,cl.id DESC LIMIT 201`,[agencyId]);
 return {items:await Promise.all(rows.slice(0,200).map(row=>present(row,true,d))),hasMore:rows.length>200};
}
export async function saveCallBillingReview(user,id,input,d=deps){
 if(!Number.isSafeInteger(Number(id))||Number(id)<1)throw fail('Invalid call.');
 if(!['request_review','not_billable','attach_claim'].includes(input?.action))throw fail('Choose a billing action.');
 const current=await getCallBillingReview(user,id,d);
 if(input.action!=='request_review'&&!current.canReview)throw fail('Billing review access is required.',403);
 if(input.action==='request_review'){
   for(const key of ['description','billingReason'])if(typeof input[key]!=='string'||input[key].trim().length<10||input[key].length>6000)throw fail('Describe the service provided and why billing review is requested (at least 10 characters each).');
   if(!Number.isFinite(Number(input.serviceMinutes))||Number(input.serviceMinutes)<=0||Number(input.serviceMinutes)>1440)throw fail('Enter actual service minutes, excluding ringing, hold time and unrelated conversation.');
   if(current.durationSeconds>0&&Number(input.serviceMinutes)*60>Number(current.durationSeconds)+1)throw fail('Service time cannot exceed the recorded call duration.');
   if(input.serviceCode&&!/^[A-Z0-9]{5}$/.test(String(input.serviceCode).toUpperCase()))throw fail('Use a five-character proposed service code, or leave it blank for billing review.');
 }
 let claimId=null;
 if(input.action==='attach_claim'){
   claimId=Number(input.claimId);if(!Number.isSafeInteger(claimId)||claimId<1)throw fail('Enter a claim ID.');
   const [claims]=await d.clinical.execute('SELECT id FROM clinical_claims WHERE id=? AND agency_id=? AND client_id=? AND is_deleted=0',[claimId,current.agencyId,current.clientId]);
   if(!claims.length)throw fail('The claim must belong to the same client and organization.');
 }
 if(!d.encryptionReady())throw fail('Secure billing documentation storage is unavailable.',503);
 const db=await d.main.getConnection();
 try{
   await db.beginTransaction();
   const [rows]=await db.execute('SELECT metadata FROM call_logs WHERE id=? AND agency_id=? AND client_id=? FOR UPDATE',[id,current.agencyId,current.clientId]);
   if(!rows.length)throw fail('Call changed. Reload it.',409);
   const stored=json(rows[0].metadata).billingReview;
   if(!Number.isInteger(input.revision)||input.revision!==(stored?.revision||0))throw fail('This review changed. Reload before saving.',409);
   if(stored?.claimId)throw fail('A claim is already linked. Make changes through the claim workflow.',409);
   if(input.action!=='request_review'&&!stored)throw fail('Request billing review before resolving or attaching a claim.');
   const details=input.action==='request_review'?{description:input.description.trim(),billingReason:input.billingReason.trim(),serviceMinutes:Number(input.serviceMinutes),serviceCode:String(input.serviceCode||'').toUpperCase(),requestedBy:user.id,requestedAt:new Date().toISOString()}:JSON.parse(d.decrypt(stored.envelope));
   const review={status:input.action==='request_review'?'review_requested':input.action==='attach_claim'?'claim_linked':'not_billable',revision:(stored?.revision||0)+1,claimId,envelope:d.encrypt(JSON.stringify(details)),updatedBy:user.id,updatedAt:new Date().toISOString()};
   await db.execute("UPDATE call_logs SET metadata=JSON_SET(COALESCE(metadata,JSON_OBJECT()),'$.billingReview',CAST(? AS JSON)) WHERE id=? AND agency_id=?",[JSON.stringify(review),id,current.agencyId]);
   await d.evidence({requestId:randomUUID(),phase:'completed',userId:user.id,method:'PUT',route:'/communications/calls/:id/billing-review',clientIp:null,ipSource:'not_collected',peerIp:null,action:'call_billing_review_saved',outcome:'success',statusCode:200,details:{agencyId:current.agencyId,callId:Number(id),review}},db,{mirror:false});
   await db.commit();
 }catch(e){await db.rollback();throw e;}finally{db.release();}
 return getCallBillingReview(user,id,d);
}
