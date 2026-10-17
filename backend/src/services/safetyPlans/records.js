import {queueClinicalFormNotification} from './notificationQueue.js';
import {createHash} from 'node:crypto';
import pool from '../../config/clinicalDatabase.js';
import {maybeEncryptNotePayload as encrypt,maybeDecryptNotePayload as decrypt} from '../clinicalNoteCrypto.service.js';
import {safetyPlanTemplate,positiveId,fail,normalizeSafetyPlan,validateReady,signatureEvidence} from './template.js';
import {getClinicalTemplate,clinicalFormCatalog,normalizeClinicalData,validateClinicalReady} from './clinicalTemplates.js';
import {appointmentPrefill} from './appointment.js';
import {staffRole,agencyAccess,clientAccess,planAccess,recipientAccess,recipientOptions,agencyBrand} from './access.js';
const portalEditableKeys=new Set(['safety-plan','release-of-information','client-information-update']);
const decode=value=>JSON.parse(decrypt(value));
const encode=value=>encrypt(JSON.stringify(value));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function transaction(fn){const db=await pool.getConnection();try{await db.beginTransaction();const result=await fn(db);await db.commit();return result;}catch(e){await db.rollback();throw e;}finally{db.release();}}
async function rowById(db,id,lock=false){const [[row]]=await db.execute(`SELECT * FROM clinical_form_records WHERE id=?${lock?' FOR UPDATE':''}`,[positiveId(id)]);if(!row)fail(404,'Safety plan not found.');return row;}
async function versionById(db,row,version=row.current_version){const [[v]]=await db.execute('SELECT * FROM clinical_form_versions WHERE plan_id=? AND version=?',[row.id,positiveId(version)]);if(!v)fail(404,'Safety plan version not found.');return v;}
async function event(db,row,user,action,version=row.current_version){await db.execute('INSERT INTO clinical_form_events(plan_id,version,actor_user_id,action) VALUES(?,?,?,?)',[row.id,version,user.id,action]);}
async function snapshot(db,row,user,payload){const serialized=JSON.stringify(payload);await db.execute('INSERT INTO clinical_form_versions(plan_id,version,payload_encrypted,content_hash,created_by_user_id) VALUES(?,?,?,?,?)',[row.id,row.current_version,encrypt(serialized),hash(payload),user.id]);}
function expectVersion(row,version){if(Number(version)!==Number(row.current_version))fail(409,'This plan has changed. Reload the current version before continuing.');}
export async function templateFor(user,{agencyId,clientId,documentKey='safety-plan',eventType,eventId}={}){
 const client=clientId?await clientAccess(user,clientId):null;const id=client?client.agency_id:positiveId(agencyId);if(!client)await agencyAccess(user,id);
 const appointment=documentKey==='attendance-verification'?await appointmentPrefill(user,{eventType,eventId,agencyId:id,clientId}):null;
 return {prefill:appointment?.data||null,source:appointment?.source||null,catalog:clinicalFormCatalog,template:await getClinicalTemplate(documentKey,id),branding:await agencyBrand(id),client:appointment?.client||(client?{id:client.id,name:client.full_name||client.initials||'',agencyId:client.agency_id}:null)};
}
export async function savePlan(user,input,id=null){
 staffRole(user);
 const result=await transaction(async db=>{
  let row=id?await rowById(db,id,true):null;
  if(row){await planAccess(user,row,{write:true});expectVersion(row,input.version);}
  const clientId=row?.client_id|| (input.clientId?positiveId(input.clientId):null);
  // Linking is a separate, explicit action. Never silently move an existing clinical record.
  if(row&&Number(input.clientId||0)!==Number(row.client_id||0))fail(400,'Use Link to client to connect an unlinked plan. Existing client links cannot be changed here.');
  const client=clientId?await clientAccess(user,clientId,{write:true}):null;
  const agencyId=row?.agency_id||client?.agency_id||positiveId(input.agencyId);
  if(!row&&client&&input.agencyId&&Number(input.agencyId)!==Number(client.agency_id))fail(403,'Select a client in the current organization.');
  if(client&&Number(client.agency_id)!==Number(agencyId))fail(403,'The client belongs to a different organization.');
  if(!client)await agencyAccess(user,agencyId,{write:true});
  let previous=row?decode((await versionById(db,row)).payload_encrypted):null;
  if(previous?.revocation)fail(409,'This authorization was revoked. Create a new authorization instead.');
  const documentKey=row?.document_key||input.documentKey||'safety-plan';
  if(row&&input.documentKey&&input.documentKey!==documentKey)fail(400,'The document type cannot be changed.');
  const template=previous?.template||await getClinicalTemplate(documentKey,agencyId);
  const data=normalizeClinicalData(input?.data,template);
  const unlinked=client?null:previous?.unlinked||{reason:typeof input.overrideReason==='string'?input.overrideReason.trim():''};
  if(!client&&(!data.personLabel||(!previous&&input.allowUnlinked!==true)||!unlinked.reason||unlinked.reason.length>2000))fail(400,'Select a client, or explicitly choose an unlinked draft and record the person’s name and reason.');
  if(!row){const [insert]=await db.execute('INSERT INTO clinical_form_records(agency_id,client_id,created_by_user_id,document_key) VALUES(?,?,?,?)',[agencyId,clientId,user.id,documentKey]);row={id:insert.insertId,agency_id:agencyId,client_id:clientId,created_by_user_id:user.id,document_key:documentKey,current_version:1};}
  else{row.current_version+=1;await db.execute('UPDATE clinical_form_records SET current_version=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[row.current_version,row.id]);}
  const appointment=documentKey==='attendance-verification'&&input.eventId?await appointmentPrefill(user,{eventType:input.eventType,eventId:input.eventId,agencyId,clientId}):null;
  const payload={data,template,appointment:previous?.appointment||appointment?.source||null,reviewStatus:documentKey==='client-information-update'?'pending':null,branding:previous?.branding||await agencyBrand(agencyId),unlinked};
  await snapshot(db,row,user,payload);await event(db,row,user,id?'revised':'created');return {id:row.id,version:row.current_version};
 });
 return readPlan(user,result.id);
}
function signerView(s){return {id:s.id,kind:s.signer_kind,userId:s.recipient_user_id,...decode(s.details_encrypted),sharedAt:s.portal_shared_at,revokedAt:s.revoked_at,signedAt:s.signed_at,method:s.signing_method,actorUserId:s.actor_user_id,evidence:s.signature_encrypted?decode(s.signature_encrypted):null};}
export async function readPlan(user,id,version){
 const row=await rowById(pool,id);await planAccess(user,row);const v=await versionById(pool,row,version||row.current_version);
 const [signers]=await pool.execute('SELECT * FROM clinical_form_signers WHERE plan_id=? AND version=? ORDER BY id',[row.id,v.version]);
 const [history]=await pool.execute('SELECT version,created_by_user_id,created_at FROM clinical_form_versions WHERE plan_id=? ORDER BY version DESC',[row.id]);
 await event(pool,row,user,'viewed',v.version);
 return {id:row.id,agencyId:row.agency_id,clientId:row.client_id,version:v.version,documentKey:row.document_key,currentVersion:row.current_version,contentHash:v.content_hash,...decode(v.payload_encrypted),revocation:decode((await versionById(pool,row)).payload_encrypted).revocation||null,signers:signers.map(signerView),history,recipients:await recipientOptions(user,row)};
}
export async function listPlans(user,{agencyId,clientId,mine}){
 staffRole(user);let rows;
 if(clientId){const client=await clientAccess(user,clientId);[rows]=await pool.execute('SELECT * FROM clinical_form_records WHERE agency_id=? AND client_id=? ORDER BY updated_at DESC LIMIT 100',[client.agency_id,client.id]);}
 else if(mine==='1'){await agencyAccess(user,positiveId(agencyId));[rows]=await pool.execute('SELECT * FROM clinical_form_records WHERE agency_id=? AND created_by_user_id=? AND client_id IS NULL ORDER BY updated_at DESC LIMIT 100',[Number(agencyId),user.id]);}
 else{await agencyAccess(user,positiveId(agencyId));[rows]=await pool.execute('SELECT * FROM clinical_form_records WHERE agency_id=? AND (created_by_user_id=? OR (client_id IS NULL AND ?=1)) ORDER BY updated_at DESC LIMIT 100',[Number(agencyId),user.id,['admin','super_admin'].includes(user.role)?1:0]);}
 const plans=[];
 for(const row of rows){try{await planAccess(user,row);}catch(e){if(e.status===403||e.status===404)continue;throw e;}const v=await versionById(pool,row);const data=decode(v.payload_encrypted);plans.push({id:row.id,clientId:row.client_id,version:row.current_version,documentName:data.data.documentName||'',name:data.data.personLabel,documentKey:data.template.key,title:data.template.title,reviewStatus:data.reviewStatus,screenStatus:data.data.screenStatus,revoked:!!data.revocation,updatedAt:row.updated_at});await event(pool,row,user,'listed');}
 return {plans};
}
export async function linkPlan(user,id,input){
 await transaction(async db=>{const row=await rowById(db,id,true);await planAccess(user,row,{write:true});expectVersion(row,input.version);if(row.client_id)fail(409,'This plan is already linked to a client.');if(input.confirmIdentity!==true)fail(400,'Confirm that this is the same person before linking.');const client=await clientAccess(user,positiveId(input.clientId),{write:true});if(Number(client.agency_id)!==Number(row.agency_id))fail(403,'Link only to a client in the same organization.');
 const previous=decode((await versionById(db,row)).payload_encrypted);row.client_id=client.id;row.current_version+=1;
 await db.execute('UPDATE clinical_form_records SET client_id=?,current_version=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[client.id,row.current_version,row.id]);await snapshot(db,row,user,{...previous,unlinked:null,linkedFromVersion:row.current_version-1});await event(db,row,user,'linked');});return readPlan(user,id);
}
export async function addSigner(user,id,input){
 await transaction(async db=>{const row=await rowById(db,id,true);await planAccess(user,row,{write:true});expectVersion(row,input.version);const v=await versionById(db,row);const payload=decode(v.payload_encrypted);if(payload.revocation)fail(409,'This authorization was revoked.');
 const allowCompletion=input.allowCompletion===true||payload.template.key==='client-information-update';
 if(allowCompletion){if(!portalEditableKeys.has(payload.template.key))fail(400,'This form must be completed by staff. Share it for review or signature.');if(!payload.data.personLabel||!payload.data.planDate)fail(400,'Enter the client name and document date before sharing.');}else validateClinicalReady(payload.data,payload.template);
 const kind=input.kind;if(!['client','guardian','clinician'].includes(kind))fail(400,'Select a signer role.');
 const copyOnly=input.copyOnly===true&&kind!=='clinician';
 if(payload.template.key==='attendance-verification'&&kind!=='clinician'){if(!copyOnly||!input.userId)fail(400,'Share an issued attendance letter as a portal copy.');const [staffSigners]=await db.execute('SELECT * FROM clinical_form_signers WHERE plan_id=? AND version=? ORDER BY id',[row.id,row.current_version]);if(!staffSigners.some(s=>s.signer_kind==='clinician'&&s.signed_at))fail(400,'Issuing staff must sign the attendance letter before sharing it.');}
 let name=typeof input.name==='string'?input.name.trim():'',recipientId=input.userId?positiveId(input.userId):null;
 if(input.allowCompletion===true&&(!recipientId||kind==='clinician'||copyOnly))fail(400,'Select a client or guardian portal to request form completion.');
 if(kind==='clinician'){if(recipientId&&recipientId!==Number(user.id))fail(403,'Clinicians sign through their own staff account.');recipientId=Number(user.id);name=`${user.first_name||''} ${user.last_name||''}`.trim()||name;}
 else if(recipientId)name=await recipientAccess(row,recipientId,kind);
 if(!name||name.length>200)fail(400,'Enter the signer’s name.');
 if(kind==='guardian'&&input.authorityConfirmed!==true)fail(400,'Verify and confirm the guardian’s authority before adding this signer.');
 const [existing]=await db.execute('SELECT * FROM clinical_form_signers WHERE plan_id=? AND version=? AND signer_kind=? AND revoked_at IS NULL',[row.id,row.current_version,kind]);
 if(existing.some(s=>recipientId?Number(s.recipient_user_id)===recipientId:decode(s.details_encrypted).name.toLowerCase()===name.toLowerCase()))fail(409,'This signer is already on the current version.');
 if(existing.length>=12)fail(400,'Use no more than 12 signers for each role.');
 await db.execute('INSERT INTO clinical_form_signers(plan_id,version,signer_kind,recipient_user_id,details_encrypted,portal_shared_at) VALUES(?,?,?,?,?,?)',[row.id,row.current_version,kind,recipientId,encode({name,copyOnly,allowCompletion:allowCompletion&&!!recipientId&&kind!=='clinician'&&!copyOnly,authorityConfirmed:input.authorityConfirmed===true}),kind!=='clinician'&&recipientId?new Date():null]);await event(db,row,user,recipientId&&kind!=='clinician'?'portal_shared':'signer_added');if(recipientId&&kind!=='clinician')await queueClinicalFormNotification(db,row.agency_id,recipientId);});return readPlan(user,id);
}
export async function revokeSigner(user,id,signerId,input){await transaction(async db=>{const row=await rowById(db,id,true);await planAccess(user,row,{write:true});expectVersion(row,input.version);const [result]=await db.execute('UPDATE clinical_form_signers SET revoked_at=CURRENT_TIMESTAMP WHERE id=? AND plan_id=? AND version=? AND revoked_at IS NULL',[positiveId(signerId),row.id,row.current_version]);if(!result.affectedRows)fail(404,'Signer not found.');await event(db,row,user,'share_revoked');});return readPlan(user,id);}
export async function signPlan(user,id,signerId,input,{portal=false}={}){
 let evidence;
 await transaction(async db=>{const row=await rowById(db,id,true);if(!portal)await planAccess(user,row,{write:true});expectVersion(row,input.version);
 const [[s]]=await db.execute('SELECT * FROM clinical_form_signers WHERE id=? AND plan_id=? AND version=? FOR UPDATE',[positiveId(signerId),row.id,row.current_version]);
 if(!s||s.revoked_at)fail(404,'Signing request not found.');
 if(portal){if(!['client','client_guardian'].includes(user.role)||user.demoMode||user.switchedFromUserId||Number(s.recipient_user_id)!==Number(user.id)||!s.portal_shared_at)fail(403,'This signing request belongs to another account.');await recipientAccess(row,user.id,s.signer_kind);}
 else if(s.signer_kind==='clinician'){if(Number(s.recipient_user_id)!==Number(user.id))fail(403,'Sign using the clinician’s own account.');}
 else{if(input.witnessConfirmed!==true)fail(400,'Confirm that this person is present and is entering their own signature.');if(s.recipient_user_id)await recipientAccess(row,s.recipient_user_id,s.signer_kind);}
 if(decode(s.details_encrypted).copyOnly)fail(400,'This is a shared copy and does not request a signature.');
 if(s.signed_at)fail(409,'This person has already signed this version.');
 const v=await versionById(db,row);if(input.contentHash!==v.content_hash)fail(409,'Review the saved plan again before signing.');const payload=decode(v.payload_encrypted);if(payload.revocation)fail(409,'This authorization was revoked.');validateClinicalReady(payload.data,payload.template);
 evidence=signatureEvidence(input,payload.template.title);
 const method=portal?'portal':s.signer_kind==='clinician'?'staff':'in_person';
 await db.execute('UPDATE clinical_form_signers SET signature_encrypted=?,signed_at=CURRENT_TIMESTAMP,actor_user_id=?,signing_method=? WHERE id=?',[encode({...evidence,contentHash:v.content_hash,version:row.current_version,witnessUserId:method==='in_person'?user.id:null}),user.id,method,s.id]);await event(db,row,user,`signed_${method}`);
 });return {signed:true};
}
export async function portalList(user,clientId){
 if(!['client','client_guardian'].includes(user.role)||user.demoMode||user.switchedFromUserId)fail(403,'Use your own client or guardian account.');
 const [rows]=await pool.execute('SELECT s.id,s.plan_id,s.version,s.signer_kind,p.agency_id,p.client_id,p.document_key FROM clinical_form_signers s JOIN clinical_form_records p ON p.id=s.plan_id WHERE s.recipient_user_id=? AND p.client_id=? AND s.portal_shared_at IS NOT NULL AND s.revoked_at IS NULL ORDER BY s.id DESC LIMIT 100',[user.id,positiveId(clientId)]);
 const shares=[];for(const r of rows){try{await recipientAccess(r,user.id,r.signer_kind);shares.push({id:r.id,planId:r.plan_id,version:r.version,documentKey:r.document_key,title:clinicalFormCatalog.find(t=>t.key===r.document_key)?.title||'Safety plan'});}catch(e){if(e.status!==403)throw e;}}return {shares};
}
export async function portalRead(user,shareId){
 if(!['client','client_guardian'].includes(user.role)||user.demoMode||user.switchedFromUserId)fail(403,'Use your own client or guardian account.');
 const [[s]]=await pool.execute('SELECT * FROM clinical_form_signers WHERE id=? AND recipient_user_id=? AND portal_shared_at IS NOT NULL AND revoked_at IS NULL',[positiveId(shareId),user.id]);if(!s)fail(404,'Shared safety plan not found.');
 const row=await rowById(pool,s.plan_id);await recipientAccess(row,user.id,s.signer_kind);const v=await versionById(pool,row,s.version);await event(pool,row,user,'portal_viewed',v.version);
 const payload=decode(v.payload_encrypted);const [signers]=await pool.execute('SELECT * FROM clinical_form_signers WHERE plan_id=? AND version=? ORDER BY id',[row.id,v.version]);
 // The private override reason and administrative history are never disclosed to portal recipients.
 return {id:row.id,clientId:row.client_id,version:v.version,documentKey:row.document_key,currentVersion:row.current_version,contentHash:v.content_hash,data:payload.data,template:payload.template,branding:payload.branding,signers:signers.filter(s=>!s.revoked_at||s.signed_at).map(signerView),mySignerId:s.id,reviewStatus:(decode((await versionById(pool,row)).payload_encrypted).reviewOfVersion===v.version?'reviewed':payload.reviewStatus)||null,revocation:decode((await versionById(pool,row)).payload_encrypted).revocation||null};
}

export async function portalSubmitUpdate(user,shareId,input){
 const shared=await portalRead(user,shareId);
 if(!portalEditableKeys.has(shared.template.key)||!(shared.signers.find(s=>s.id===shared.mySignerId)?.allowCompletion||shared.template.key==='client-information-update'))fail(400,'This document was shared for review or signature, not editing.');
 await transaction(async db=>{
  const row=await rowById(db,shared.id,true);expectVersion(row,input.version);
  const [[signer]]=await db.execute('SELECT * FROM clinical_form_signers WHERE id=? AND plan_id=? AND version=? FOR UPDATE',[shared.mySignerId,row.id,row.current_version]);
  if(!signer||signer.revoked_at||signer.signed_at)fail(409,'This request is no longer available for editing.');
  await recipientAccess(row,user.id,signer.signer_kind);
  const permission=decode(signer.details_encrypted);if(permission.copyOnly||!(permission.allowCompletion||shared.template.key==='client-information-update'))fail(400,'This document is not available for completion.');
  const old=await versionById(db,row);if(old.content_hash!==input.contentHash)fail(409,'Reload this update before submitting.');
  const previous=decode(old.payload_encrypted);if(previous.revocation)fail(409,'This authorization was revoked.');const data=normalizeClinicalData(input.data,previous.template);validateClinicalReady(data,previous.template);
  const evidence=signatureEvidence(input,previous.template.title);
  row.current_version+=1;await db.execute('UPDATE clinical_form_records SET current_version=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[row.current_version,row.id]);
  const payload={...previous,data,reviewStatus:'pending',submittedByUserId:user.id};await snapshot(db,row,user,payload);
  const [insert]=await db.execute('INSERT INTO clinical_form_signers(plan_id,version,signer_kind,recipient_user_id,details_encrypted,portal_shared_at) VALUES(?,?,?,?,?,?)',[row.id,row.current_version,signer.signer_kind,user.id,signer.details_encrypted,new Date()]);
  await db.execute('UPDATE clinical_form_signers SET signature_encrypted=?,signed_at=CURRENT_TIMESTAMP,actor_user_id=?,signing_method=? WHERE id=?',[encode({...evidence,version:row.current_version,contentHash:hash(payload)}),user.id,'portal',insert.insertId]);
  await event(db,row,user,'information_update_submitted');
 });return portalList(user,shared.clientId);
}
export async function reviewUpdate(user,id,input){
 await transaction(async db=>{const row=await rowById(db,id,true);await planAccess(user,row,{write:true});expectVersion(row,input.version);const previous=decode((await versionById(db,row)).payload_encrypted);
 if(!portalEditableKeys.has(previous.template.key)||previous.reviewStatus!=='pending')fail(400,'Select a submitted form awaiting review.');
 if(input.reviewed!==true)fail(400,'Confirm that you reviewed this submission.');
 row.current_version+=1;await db.execute('UPDATE clinical_form_records SET current_version=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[row.current_version,row.id]);await snapshot(db,row,user,{...previous,reviewStatus:'reviewed',reviewOfVersion:row.current_version-1,reviewedByUserId:user.id,reviewedAt:new Date().toISOString()});await event(db,row,user,'information_update_reviewed');});return readPlan(user,id);
}
export async function revokeAuthorization(user,id,input,{portalShareId=null}={}){
 const shared=portalShareId?await portalRead(user,portalShareId):null;
 const reason=typeof input.reason==='string'?input.reason.trim():'';
 if(!reason||reason.length>2000||input.confirm!==true)fail(400,'Confirm the revocation and record the request in writing.');
 await transaction(async db=>{const row=await rowById(db,id,true);if(shared){if(shared.id!==row.id)fail(403,'This authorization is not available.');await recipientAccess(row,user.id,shared.signers.find(s=>s.id===shared.mySignerId).kind);}else await planAccess(user,row,{write:true});expectVersion(row,input.version);
 const previous=decode((await versionById(db,row)).payload_encrypted);if(previous.template.key!=='release-of-information')fail(400,'Only release authorizations use this action.');if(previous.revocation)fail(409,'This authorization is already revoked.');
 row.current_version+=1;await db.execute('UPDATE clinical_form_records SET current_version=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[row.current_version,row.id]);await snapshot(db,row,user,{...previous,revocation:{reason,recordedAt:new Date().toISOString(),recordedByUserId:user.id}});await event(db,row,user,'authorization_revoked');});
 return shared?portalRead(user,portalShareId):readPlan(user,id);
}
