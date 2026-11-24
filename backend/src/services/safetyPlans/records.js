import {saveSharedOutcomeResponse} from '../outcomeMeasures.service.js';
import {resolveEnrollmentFoundation} from '../enrollmentPortal.service.js';
import { isStandaloneEnrollmentForm } from '../familySharingCatalog.js';
import { completedPortalScreen, portalScreenDefinition, requirePortalScreenRecipient } from '../familyPortalScreening.service.js';
import {queueClinicalFormNotification} from './notificationQueue.js';
import {createHash} from 'node:crypto';
import pool from '../../config/clinicalDatabase.js';
import {maybeEncryptNotePayload as encrypt,maybeDecryptNotePayload as decrypt} from '../clinicalNoteCrypto.service.js';
import {safetyPlanTemplate,positiveId,fail,normalizeSafetyPlan,validateReady,signatureEvidence} from './template.js';
import {getClinicalTemplate,clinicalFormCatalog,normalizeClinicalData,validateClinicalReady} from './clinicalTemplates.js';
import {appointmentPrefill} from './appointment.js';
import {staffRole,agencyAccess,clientAccess,planAccess,recipientAccess,recipientOptions,agencyBrand} from './access.js';
const portalEditableKeys=new Set(['safety-plan','release-of-information','client-information-update','enrollment-document']);
const decode=value=>JSON.parse(decrypt(value));
const encode=value=>encrypt(JSON.stringify(value));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function transaction(fn,existingDb=null){if(existingDb)return fn(existingDb);const db=await pool.getConnection();try{await db.beginTransaction();const result=await fn(db);await db.commit();return result;}catch(e){await db.rollback();throw e;}finally{db.release();}}
async function rowById(db,id,lock=false){const [[row]]=await db.execute(`SELECT * FROM clinical_form_records WHERE id=?${lock?' FOR UPDATE':''}`,[positiveId(id)]);if(!row)fail(404,'Safety plan not found.');return row;}
async function versionById(db,row,version=row.current_version){const [[v]]=await db.execute('SELECT * FROM clinical_form_versions WHERE plan_id=? AND version=?',[row.id,positiveId(version)]);if(!v)fail(404,'Safety plan version not found.');return v;}
async function event(db,row,user,action,version=row.current_version){await db.execute('INSERT INTO clinical_form_events(plan_id,version,actor_user_id,action) VALUES(?,?,?,?)',[row.id,version,user.id,action]);}
async function snapshot(db,row,user,payload){const serialized=JSON.stringify(payload);await db.execute('INSERT INTO clinical_form_versions(plan_id,version,payload_encrypted,content_hash,created_by_user_id) VALUES(?,?,?,?,?)',[row.id,row.current_version,encrypt(serialized),hash(payload),user.id]);}
function expectVersion(row,version){if(Number(version)!==Number(row.current_version))fail(409,'This plan has changed. Reload the current version before continuing.');}
export async function templateFor(user,{agencyId,clientId,documentKey='safety-plan',eventType,eventId,appointmentId}={}){
 const appointment=documentKey==='attendance-verification'&&eventId?await appointmentPrefill(user,{eventType,eventId,appointmentId,agencyId,clientId}):null;
 const client=clientId?await clientAccess(user,clientId,{documentKey}):null;const id=appointment?.client.agencyId||client?.agency_id||positiveId(agencyId);if(!client&&!appointment)await agencyAccess(user,id);
 return {prefill:appointment?.data||null,source:appointment?.source||null,catalog:clinicalFormCatalog,template:await getClinicalTemplate(documentKey,id),branding:await agencyBrand(id),...(client&&documentKey==='release-of-information'?{recipients:await recipientOptions(user,{client_id:client.id,agency_id:id,document_key:documentKey})}:{}),client:appointment?.client||(client?{id:client.id,name:client.full_name||client.initials||'',agencyId:client.agency_id}:null)};
}
export async function savePlan(user,input,id=null,{database=null,returnReference=false,preparedTemplate=null}={}){
 if(user?.role!=='support'||input.documentKey!=='release-of-information'||!input.clientId)staffRole(user);
 const result=await transaction(async db=>{
  let row=id?await rowById(db,id,true):null;
  if(row){await planAccess(user,row,{write:true});expectVersion(row,input.version);}
  const clientId=row?.client_id|| (input.clientId?positiveId(input.clientId):null);
  // Linking is a separate, explicit action. Never silently move an existing clinical record.
  if(row&&Number(input.clientId||0)!==Number(row.client_id||0))fail(400,'Use Link to client to connect an unlinked plan. Existing client links cannot be changed here.');
  const client=clientId?await clientAccess(user,clientId,{write:true,documentKey:row?.document_key||input.documentKey}):null;
  const agencyId=row?.agency_id||client?.agency_id||positiveId(input.agencyId);
  if(!row&&client&&input.agencyId&&Number(input.agencyId)!==Number(client.agency_id))fail(403,'Select a client in the current organization.');
  if(client&&Number(client.agency_id)!==Number(agencyId))fail(403,'The client belongs to a different organization.');
  if(!client)await agencyAccess(user,agencyId,{write:true});
  let previous=row?decode((await versionById(db,row)).payload_encrypted):null;
  if(previous?.revocation)fail(409,'This authorization was revoked. Create a new authorization instead.');
  const documentKey=row?.document_key||input.documentKey||'safety-plan';
  if(row&&input.documentKey&&input.documentKey!==documentKey)fail(400,'The document type cannot be changed.');
  const template=previous?.template||preparedTemplate||(documentKey==='enrollment-document'?await resolveEnrollmentFoundation(user,{...(input.enrollmentContext||{}),clientId,agencyId,foundationKey:input.foundationKey}):await getClinicalTemplate(documentKey,agencyId));
  const data=normalizeClinicalData(input?.data,template);
  const unlinked=client?null:previous?.unlinked||{reason:typeof input.overrideReason==='string'?input.overrideReason.trim():''};
  if(!client&&(!data.personLabel||(!previous&&input.allowUnlinked!==true)||!unlinked.reason||unlinked.reason.length>2000))fail(400,'Select a client, or explicitly choose an unlinked draft and record the person’s name and reason.');
  if(!row){const [insert]=await db.execute('INSERT INTO clinical_form_records(agency_id,client_id,created_by_user_id,document_key) VALUES(?,?,?,?)',[agencyId,clientId,user.id,documentKey]);row={id:insert.insertId,agency_id:agencyId,client_id:clientId,created_by_user_id:user.id,document_key:documentKey,current_version:1};}
  else{row.current_version+=1;await db.execute('UPDATE clinical_form_records SET current_version=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[row.current_version,row.id]);}
  const appointment=documentKey==='attendance-verification'&&input.eventId?await appointmentPrefill(user,{eventType:input.eventType,eventId:input.eventId,appointmentId:input.appointmentId,agencyId,clientId}):null;
  const payload={data,template,appointment:previous?.appointment||appointment?.source||null,reviewStatus:documentKey==='client-information-update'?'pending':null,branding:previous?.branding||await agencyBrand(agencyId),unlinked};
  await snapshot(db,row,user,payload);await event(db,row,user,id?'revised':'created');return {id:row.id,version:row.current_version};
 },database);
 return returnReference?result:readPlan(user,result.id);
}
function signerView(s){return {id:s.id,kind:s.signer_kind,userId:s.recipient_user_id,...decode(s.details_encrypted),sharedAt:s.portal_shared_at,revokedAt:s.revoked_at,signedAt:s.signed_at,method:s.signing_method,actorUserId:s.actor_user_id,evidence:s.signature_encrypted?decode(s.signature_encrypted):null};}
export async function readPlan(user,id,version){
 const row=await rowById(pool,id);await planAccess(user,row);const v=await versionById(pool,row,version||row.current_version);
 const [signers]=await pool.execute('SELECT * FROM clinical_form_signers WHERE plan_id=? AND version=? ORDER BY id',[row.id,v.version]);
 let releaseContact=null;
 if(row.document_key==='release-of-information'&&signers.some(signer=>signer.signed_at&&decode(signer.details_encrypted).managed)){
  const [[link]]=await pool.execute('SELECT state,affiliation_id FROM clinical_release_recipient_links WHERE plan_id=? AND version<=? ORDER BY version DESC LIMIT 1',
   [row.id,v.version]);
  if(link)releaseContact={state:link.state,affiliationId:link.affiliation_id};
 }
 const [history]=await pool.execute('SELECT version,created_by_user_id,created_at FROM clinical_form_versions WHERE plan_id=? ORDER BY version DESC',[row.id]);
 await event(pool,row,user,'viewed',v.version);
 return {id:row.id,agencyId:row.agency_id,clientId:row.client_id,version:v.version,documentKey:row.document_key,currentVersion:row.current_version,contentHash:v.content_hash,...decode(v.payload_encrypted),revocation:decode((await versionById(pool,row)).payload_encrypted).revocation||null,signers:signers.map(signerView),history,releaseContact,recipients:await recipientOptions(user,row)};
}
export async function listReleaseRelationships(user, clientId) {
 const client=await clientAccess(user,clientId,{documentKey:'release-of-information'});
 const [rows]=await pool.execute(`SELECT r.id,r.current_version,v.payload_encrypted
   FROM clinical_form_records r JOIN clinical_form_versions v ON v.plan_id=r.id AND v.version=r.current_version
   WHERE r.agency_id=? AND r.client_id=? AND r.document_key='release-of-information'
   ORDER BY r.updated_at DESC LIMIT 100`,[client.agency_id,client.id]);
 const releases=[];
 for (const row of rows) {
   const payload=decode(row.payload_encrypted);
   const [signers]=await pool.execute(`SELECT details_encrypted,portal_shared_at,signed_at,revoked_at
     FROM clinical_form_signers WHERE plan_id=? AND version=? AND signer_kind<>'clinician'
     AND (portal_shared_at IS NOT NULL OR signed_at IS NOT NULL) ORDER BY id`,[row.id,payload.reviewOfVersion||row.current_version]);
   const recipient=String(payload.data?.recipientName||'').trim();
   if (recipient) releases.push({id:`release-${row.id}`,name:recipient,kind:'Named in release',status:payload.revocation?'Revoked':payload.reviewStatus==='reviewed'?'Reviewed':'On file'});
   for (const signer of signers) {
     const name=String(decode(signer.details_encrypted).name||'').trim();
     if (name) releases.push({id:`share-${row.id}-${releases.length}`,name,kind:'Release request',status:signer.revoked_at||payload.revocation?'Revoked':signer.signed_at?'Signed':'Shared to portal',at:signer.signed_at||signer.portal_shared_at});
   }
   await event(pool,row,user,'listed');
 }
 return releases;
}
export async function listPlans(user,{agencyId,clientId,mine,documentKey}){
 const releaseList=user.role==='support' && clientId && documentKey==='release-of-information';
 if(!releaseList)staffRole(user);
 let rows;
 if(releaseList){
  const client=await clientAccess(user,clientId,{documentKey});
  [rows]=await pool.execute('SELECT * FROM clinical_form_records WHERE agency_id=? AND client_id=? AND document_key=? ORDER BY updated_at DESC LIMIT 100',[client.agency_id,client.id,documentKey]);
 } else if(clientId){const client=await clientAccess(user,clientId);[rows]=await pool.execute('SELECT * FROM clinical_form_records WHERE agency_id=? AND client_id=? ORDER BY updated_at DESC LIMIT 100',[client.agency_id,client.id]);}
 else if(mine==='1'){await agencyAccess(user,positiveId(agencyId));[rows]=await pool.execute('SELECT * FROM clinical_form_records WHERE agency_id=? AND created_by_user_id=? AND client_id IS NULL ORDER BY updated_at DESC LIMIT 100',[Number(agencyId),user.id]);}
 else{await agencyAccess(user,positiveId(agencyId));[rows]=await pool.execute('SELECT * FROM clinical_form_records WHERE agency_id=? AND (created_by_user_id=? OR (client_id IS NULL AND ?=1)) ORDER BY updated_at DESC LIMIT 100',[Number(agencyId),user.id,['admin','super_admin'].includes(user.role)?1:0]);}
 const plans=[];
 for (const row of rows) {
   try {
     await planAccess(user, row);
   } catch (error) {
     if ([403, 404].includes(error.status)) continue;
     throw error;
   }
   const version = await versionById(pool, row);
   const data = decode(version.payload_encrypted);
   const [signers] = await pool.execute(
     'SELECT * FROM clinical_form_signers WHERE plan_id=? AND version=? ORDER BY id',
     [row.id, data.reviewOfVersion || row.current_version]
   );
   const active = signers.filter(s => !s.revoked_at).map(s => ({ ...s, details: decode(s.details_encrypted) }));
   const portalAssignments = active.filter(s => s.portal_shared_at && s.recipient_user_id && s.signer_kind !== 'clinician').map(s => ({
     signerId: s.id, managed:!!s.details.managed, recipient: s.details.name, recipientUserId: Number(s.recipient_user_id), kind: s.signer_kind, copyOnly: !!s.details.copyOnly,
     signedAt: s.signed_at, version: s.version, sharedAt: s.portal_shared_at
   }));
   plans.push({
     id: row.id, clientId: row.client_id, version: row.current_version, documentName: data.data.documentName || '',
     name: data.data.personLabel, documentKey: data.template.key, title: data.template.title, portalAssignments,
     signedVersion:active.find(s=>s.signed_at)?.version || null, signedAt:active.find(s=>s.signed_at)?.signed_at || null,
     sharedCount: active.filter(s => s.portal_shared_at).length, signedCount: active.filter(s => s.signed_at).length,
     pendingSignatures: active.filter(s => !s.signed_at && !s.details.copyOnly).length,
     source: data.template.source || null, appointment: data.appointment || null, reviewStatus: data.reviewStatus,
     screenStatus: data.data.screenStatus, revoked: !!data.revocation, updatedAt: row.updated_at
   });
   await event(pool, row, user, 'listed');
 }
 return {plans};
}
export async function remindSigner(user,id,signerId){
  return transaction(async db=>{
    const row=await rowById(db,id,true);
    await planAccess(user,row,{write:true});
    const [[s]]=await db.execute('SELECT * FROM clinical_form_signers WHERE id=? AND plan_id=? AND version=? AND portal_shared_at IS NOT NULL AND signed_at IS NULL AND revoked_at IS NULL FOR UPDATE',[positiveId(signerId),row.id,row.current_version]);
    const payload=decode((await versionById(db,row)).payload_encrypted);
    if(!s||payload.revocation||decode(s.details_encrypted).copyOnly)fail(409,'This form is no longer awaiting a portal signature.');
    await recipientAccess(row,s.recipient_user_id,s.signer_kind);
    await queueClinicalFormNotification(db,row.agency_id,s.recipient_user_id);
    await event(db,row,user,'reminder_requested');
    return {requested:true};
  });
}
export async function linkPlan(user,id,input){
 await transaction(async db=>{const row=await rowById(db,id,true);await planAccess(user,row,{write:true});expectVersion(row,input.version);if(row.client_id)fail(409,'This plan is already linked to a client.');if(input.confirmIdentity!==true)fail(400,'Confirm that this is the same person before linking.');const client=await clientAccess(user,positiveId(input.clientId),{write:true});if(Number(client.agency_id)!==Number(row.agency_id))fail(403,'Link only to a client in the same organization.');
 const previous=decode((await versionById(db,row)).payload_encrypted);row.client_id=client.id;row.current_version+=1;
 await db.execute('UPDATE clinical_form_records SET client_id=?,current_version=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[client.id,row.current_version,row.id]);await snapshot(db,row,user,{...previous,unlinked:null,linkedFromVersion:row.current_version-1});await event(db,row,user,'linked');});return readPlan(user,id);
}
export async function addSigner(user,id,input,{notify=true,database=null,returnReference=false,managed=false,portalVisible=true}={}){
 const signerId=await transaction(async db=>{const row=await rowById(db,id,true);await planAccess(user,row,{write:true});expectVersion(row,input.version);const v=await versionById(db,row);const payload=decode(v.payload_encrypted);if(payload.revocation)fail(409,'This authorization was revoked.');
 const allowCompletion=input.allowCompletion===true||payload.template.key==='client-information-update';
 if(allowCompletion){if(!portalEditableKeys.has(payload.template.key))fail(400,'This form must be completed by staff. Share it for review or signature.');if(!payload.data.personLabel||!payload.data.planDate)fail(400,'Enter the client name and document date before sharing.');}else validateClinicalReady(payload.data,payload.template);
 if(user.role==='support' && (input.kind==='clinician'||!input.userId))fail(403,'Select a linked portal recipient to sign this release.');
 const kind=input.kind;if(!['client','guardian','clinician'].includes(kind))fail(400,'Select a signer role.');
 if(kind!=='clinician' && (input.userId||managed) && (payload.template.key==='cssrs-screener'
   || (payload.template.key==='enrollment-document' && payload.template.source?.foundationKey && !isStandaloneEnrollmentForm(payload.template.source.foundationKey)))) {
   fail(400,'This form has a dedicated workflow or is available for staff use only.');
 }
 const copyOnly=input.copyOnly===true&&kind!=='clinician';
 if(payload.template.key==='attendance-verification'&&kind!=='clinician'){if(!copyOnly||(!input.userId&&!managed))fail(400,'Share an issued attendance letter as a copy.');const [staffSigners]=await db.execute('SELECT * FROM clinical_form_signers WHERE plan_id=? AND version=? ORDER BY id',[row.id,row.current_version]);if(!staffSigners.some(s=>s.signer_kind==='clinician'&&s.signed_at))fail(400,'Issuing staff must sign the attendance letter before sharing it.');}
 let name=typeof input.name==='string'?input.name.trim():'',recipientId=input.userId?positiveId(input.userId):null;
 if(kind!=='clinician')await checkFormRespondent(payload,row,recipientId,kind,allowCompletion&&!copyOnly,managed);
 if(input.allowCompletion===true&&((!recipientId&&!managed)||kind==='clinician'||copyOnly))fail(400,'Select a client or guardian portal to request form completion.');
 if(kind==='clinician'){if(recipientId&&recipientId!==Number(user.id))fail(403,'Clinicians sign through their own staff account.');recipientId=Number(user.id);name=`${user.first_name||''} ${user.last_name||''}`.trim()||name;}
 else if(recipientId)name=await recipientAccess(row,recipientId,kind);
 if(!name||name.length>200)fail(400,'Enter the signer’s name.');
 if(kind==='guardian'&&input.authorityConfirmed!==true)fail(400,'Verify and confirm the guardian’s authority before adding this signer.');
 const [existing]=await db.execute('SELECT * FROM clinical_form_signers WHERE plan_id=? AND version=? AND signer_kind=? AND revoked_at IS NULL',[row.id,row.current_version,kind]);
 if(existing.some(s=>recipientId?Number(s.recipient_user_id)===recipientId:decode(s.details_encrypted).name.toLowerCase()===name.toLowerCase()))fail(409,'This signer is already on the current version.');
 if(existing.length>=12)fail(400,'Use no more than 12 signers for each role.');
 const details={name,copyOnly,allowCompletion:allowCompletion&&(!!recipientId||managed)&&kind!=='clinician'&&!copyOnly,authorityConfirmed:input.authorityConfirmed===true,...(managed?{managed:true}:{})};
 const [result]=await db.execute('INSERT INTO clinical_form_signers(plan_id,version,signer_kind,recipient_user_id,details_encrypted,portal_shared_at) VALUES(?,?,?,?,?,?)',[row.id,row.current_version,kind,recipientId,encode(details),kind!=='clinician'&&recipientId&&portalVisible?new Date():null]);
 await event(db,row,user,recipientId&&kind!=='clinician'&&portalVisible?'portal_shared':'signer_added');
 if(managed)await db.execute('UPDATE clinical_form_signers SET delivery_managed=1 WHERE id=?',[result.insertId]);
 if(notify&&recipientId&&portalVisible&&kind!=='clinician')await queueClinicalFormNotification(db,row.agency_id,recipientId);
 return result.insertId;
 },database);
 return returnReference?{id:Number(id),...(managed?{signerId}:{})}:readPlan(user,id);
}
export async function revokeSigner(user,id,signerId,input){await transaction(async db=>{const row=await rowById(db,id,true);await planAccess(user,row,{write:true});expectVersion(row,input.version);const [result]=await db.execute('UPDATE clinical_form_signers SET revoked_at=CURRENT_TIMESTAMP WHERE id=? AND plan_id=? AND version=? AND revoked_at IS NULL',[positiveId(signerId),row.id,row.current_version]);if(!result.affectedRows)fail(404,'Signer not found.');await event(db,row,user,'share_revoked');});return readPlan(user,id);}
export async function signPlan(user,id,signerId,input,{portal=false}={}){
 if(user.role==='support')fail(403,'The authorized recipient must sign this release.');
 let evidence;
 await transaction(async db=>{const row=await rowById(db,id,true);if(!portal)await planAccess(user,row,{write:true});expectVersion(row,input.version);
 const [[s]]=await db.execute('SELECT * FROM clinical_form_signers WHERE id=? AND plan_id=? AND version=? FOR UPDATE',[positiveId(signerId),row.id,row.current_version]);
 if(!s||s.revoked_at)fail(404,'Signing request not found.');
 if(portal){if(!['client','client_guardian'].includes(user.role)||user.demoMode||user.switchedFromUserId||Number(s.recipient_user_id)!==Number(user.id)||!s.portal_shared_at)fail(403,'This signing request belongs to another account.');await recipientAccess(row,user.id,s.signer_kind);}
 else if(s.signer_kind==='clinician'){if(Number(s.recipient_user_id)!==Number(user.id))fail(403,'Sign using the clinician’s own account.');}
 else{if(input.witnessConfirmed!==true)fail(400,'Confirm that this person is present and is entering their own signature.');if(s.recipient_user_id)await recipientAccess(row,s.recipient_user_id,s.signer_kind);}
 const details=decode(s.details_encrypted);
 if(details.copyOnly)fail(400,'This is a shared copy and does not request a signature.');
 if(details.managed&&details.allowCompletion)fail(400,'Complete the form before signing.');
 if(s.signed_at)fail(409,'This person has already signed this version.');
 const v=await versionById(db,row);if(input.contentHash!==v.content_hash)fail(409,'Review the saved plan again before signing.');const payload=decode(v.payload_encrypted);if(payload.revocation)fail(409,'This authorization was revoked.');
 if (portal && portalScreenDefinition(payload.template.source?.foundationKey)) fail(400,'Complete the questionnaire before submitting it.');
 validateClinicalReady(payload.data,payload.template);
 if(payload.template.key==='attendance-verification'&&payload.appointment){const current=await appointmentPrefill(user,{...payload.appointment,agencyId:row.agency_id,clientId:row.client_id});if(payload.data.letterType==='Scheduled appointment'&&['appointmentDate','startTime','endTime','timezone'].some(key=>payload.data[key]!==current.data[key]))fail(409,'The appointment details changed. Reload the saved session before issuing its confirmation.');}
 if(payload.template.defaultTermMonths===12 && s.signer_kind==='guardian' && !payload.data.representativeAuthority)fail(400,'Record the representative’s authority before signing.');
 evidence=signatureEvidence(input,payload.template.title);
 const method=portal?'portal':s.signer_kind==='clinician'?'staff':'in_person';
 await db.execute('UPDATE clinical_form_signers SET signature_encrypted=?,signed_at=CURRENT_TIMESTAMP,actor_user_id=?,signing_method=? WHERE id=?',[encode({...evidence,contentHash:v.content_hash,version:row.current_version,witnessUserId:method==='in_person'?user.id:null}),user.id,method,s.id]);await event(db,row,user,`signed_${method}`);await markReleaseForFiling(db,row,details.managed);
 });return {signed:true};
}
export async function portalList(user,clientId,{agencyId=null}={}){
 if(!['client','client_guardian'].includes(user.role)||user.demoMode||user.switchedFromUserId)fail(403,'Use your own client or guardian account.');
 const [rows]=await pool.execute('SELECT s.id,s.plan_id,s.version,s.signer_kind,s.signed_at,s.details_encrypted,p.agency_id,p.client_id,p.document_key,p.current_version FROM clinical_form_signers s JOIN clinical_form_records p ON p.id=s.plan_id WHERE s.recipient_user_id=? AND p.client_id=? AND s.portal_shared_at IS NOT NULL AND s.revoked_at IS NULL ORDER BY s.id DESC LIMIT 100',[user.id,positiveId(clientId)]);
 const shares=[];
 for (const r of rows) {
  if(agencyId&&Number(r.agency_id)!==Number(agencyId))continue;
  try{
   await recipientAccess(r,user.id,r.signer_kind);
   const payload=decode((await versionById(pool,{id:r.plan_id,current_version:r.version})).payload_encrypted);
   const details=r.details_encrypted?decode(r.details_encrypted):{};
   await checkFormRespondent(payload,r,user.id,r.signer_kind,details.allowCompletion,details.managed);
   shares.push({id:r.id,planId:r.plan_id,version:r.version,documentKey:r.document_key,title:payload.data.documentName||payload.template.title||'Clinical document',signedAt:r.signed_at||null,allowCompletion:!!details.allowCompletion,superseded:!!r.current_version&&Number(r.version)!==Number(r.current_version),copyOnly:!!details.copyOnly});
  } catch(e){if(e.status!==403)throw e;}
 }
 return {shares};
}
export async function portalRead(user,shareId,{agencyId=null,clientId=null,auditActor=null}={}){
 if(!['client','client_guardian'].includes(user.role)||user.demoMode||user.switchedFromUserId)fail(403,'Use your own client or guardian account.');
 const [[s]]=await pool.execute('SELECT * FROM clinical_form_signers WHERE id=? AND recipient_user_id=? AND portal_shared_at IS NOT NULL AND revoked_at IS NULL',[positiveId(shareId),user.id]);if(!s)fail(404,'Shared safety plan not found.');
 const row=await rowById(pool,s.plan_id);if((agencyId&&Number(row.agency_id)!==Number(agencyId))||(clientId&&Number(row.client_id)!==Number(clientId)))fail(404,'Shared document unavailable in this portal.');await recipientAccess(row,user.id,s.signer_kind);const v=await versionById(pool,row,s.version);
 const payload=decode(v.payload_encrypted);
 const details=decode(s.details_encrypted);
 await checkFormRespondent(payload,row,user.id,s.signer_kind,details.allowCompletion,details.managed);
 await event(pool,row,auditActor||user,auditActor?'portal_previewed':'portal_viewed',v.version);
 const [signers]=await pool.execute('SELECT * FROM clinical_form_signers WHERE plan_id=? AND version=? ORDER BY id',[row.id,v.version]);
 // The private override reason and administrative history are never disclosed to portal recipients.
 return {id:row.id,clientId:row.client_id,version:v.version,documentKey:row.document_key,currentVersion:row.current_version,contentHash:v.content_hash,data:payload.data,template:payload.template,branding:payload.branding,signers:signers.filter(s=>(!s.revoked_at||s.signed_at)&&(!details.managed||s.id===shareId||Number(s.id)===Number(shareId)||(details.copyOnly&&s.signer_kind==='clinician'))).map(signerView),mySignerId:s.id,reviewStatus:(decode((await versionById(pool,row)).payload_encrypted).reviewOfVersion===v.version?'reviewed':payload.reviewStatus)||null,revocation:decode((await versionById(pool,row)).payload_encrypted).revocation||null};
}

async function checkFormRespondent(payload,row,userId,kind,allowCompletion,managed=false) {
 const measure=payload.template.outcomeMeasure;
 if(measure&&(kind!==(measure.respondent==='caregiver'?'guardian':'client')||!allowCompletion))fail(403,'Choose the authorized assessment respondent.');
 const screen=portalScreenDefinition(payload.template.source?.foundationKey);
 if(!screen||userId||!managed)return requirePortalScreenRecipient(screen,row,userId,kind,allowCompletion);
 if(kind!=='client'||screen.recipient!=='client'||!allowCompletion)fail(403,'Choose the authorized respondent for this assessment.');
}

async function markReleaseForFiling(db,row,managed) {
 if(managed&&row.document_key==='release-of-information')await db.execute(
  'INSERT IGNORE INTO clinical_release_recipient_links(plan_id,version) VALUES(?,?)',[row.id,row.current_version]);
}

async function submitFormUpdate(db,{row,signer,input,userId,method}) {
 const permission=decode(signer.details_encrypted);
 if(permission.copyOnly)fail(400,'This document is not available for completion.');
 const old=await versionById(db,row);
 if(old.content_hash!==input.contentHash)fail(409,'Reload this update before submitting.');
 const previous=decode(old.payload_encrypted);
 if(previous.revocation)fail(409,'This authorization was revoked.');
 if(!portalEditableKeys.has(previous.template.key)||(!permission.allowCompletion&&previous.template.key!=='client-information-update'))fail(400,'This document is not available for completion.');
 const data=normalizeClinicalData(input.data,previous.template);
 const screen=portalScreenDefinition(previous.template.source?.foundationKey);
 await checkFormRespondent(previous,row,signer.recipient_user_id,signer.signer_kind,permission.allowCompletion,permission.managed);
 if(screen||previous.template.key==='release-of-information'||permission.managed)data.personLabel=previous.data.personLabel;
 if(permission.managed){data.planDate=previous.data.planDate;data.documentName=previous.data.documentName;}
 validateClinicalReady(data,previous.template);
 if(previous.template.defaultTermMonths===12&&signer.signer_kind==='guardian'&&!data.representativeAuthority)fail(400,'Enter your authority to sign for the client.');
 const evidence=signatureEvidence(input,previous.template.title);
 row.current_version+=1;
 await db.execute('UPDATE clinical_form_records SET current_version=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[row.current_version,row.id]);
 const screeningResult=completedPortalScreen(previous.template,data);
 if(previous.template.outcomeMeasure)await saveSharedOutcomeResponse({db,clientId:row.client_id,agencyId:row.agency_id,
   actorId:userId,signerId:signer.id,measure:previous.template.outcomeMeasure,answers:data.answers,respondentName:permission.name});
 const payload={...previous,data,reviewStatus:'pending',submittedByUserId:userId,...(permission.managed?{managedSubmission:true}:{}),...(screeningResult?{screeningResult}:{})};
 await snapshot(db,row,{id:userId},payload);
 const [insert]=await db.execute('INSERT INTO clinical_form_signers(plan_id,version,signer_kind,recipient_user_id,details_encrypted,portal_shared_at) VALUES(?,?,?,?,?,?)',[row.id,row.current_version,signer.signer_kind,signer.recipient_user_id,signer.details_encrypted,signer.portal_shared_at?new Date():null]);
 await db.execute('UPDATE clinical_form_signers SET signature_encrypted=?,signed_at=CURRENT_TIMESTAMP,actor_user_id=?,signing_method=? WHERE id=?',[encode({...evidence,version:row.current_version,contentHash:hash(payload)}),userId,method,insert.insertId]);
 if(permission.managed)await db.execute("UPDATE clinical_document_request_items SET completed_version=?,completed_signer_id=? WHERE signer_id=? AND source_kind='form'",[row.current_version,insert.insertId,signer.id]);
 if(permission.managed)await db.execute('UPDATE clinical_form_signers SET delivery_managed=1 WHERE id=?',[insert.insertId]);
 await markReleaseForFiling(db,row,permission.managed);
 if(userId)await event(db,row,{id:userId},'information_update_submitted');
 return {signed:true};
}

export async function portalSubmitUpdate(user,shareId,input) {
 const shared=await portalRead(user,shareId);
 await transaction(async db=>{
  const row=await rowById(db,shared.id,true);
  expectVersion(row,input.version);
  const [[signer]]=await db.execute('SELECT * FROM clinical_form_signers WHERE id=? AND plan_id=? AND version=? FOR UPDATE',[shared.mySignerId,row.id,row.current_version]);
  if(!signer||signer.revoked_at||signer.signed_at)fail(409,'This request is no longer available for editing.');
  await recipientAccess(row,user.id,signer.signer_kind);
  return submitFormUpdate(db,{row,signer,input,userId:user.id,method:'portal'});
 });
 return portalList(user,shared.clientId);
}

// Callable only after the document-request service verifies its recipient and item.
export async function directFormItem(db,item,{lock=false}={}) {
 const row=await rowById(db,item.source_id,lock);
 if(Number(row.client_id)!==Number(item.client_id)||Number(row.agency_id)!==Number(item.agency_id))fail(404,'Document unavailable.');
 const version=Number(item.completed_version||item.source_version);
 const [[signer]]=await db.execute('SELECT * FROM clinical_form_signers WHERE id=? AND plan_id=? AND version=?',[item.completed_signer_id||item.signer_id,row.id,version]);
 if(!signer||signer.revoked_at||!decode(signer.details_encrypted).managed)fail(404,'Document unavailable.');
 const current=await versionById(db,row);
 const currentPayload=decode(current.payload_encrypted);
 if(!signer.signed_at&&(currentPayload.revocation||version!==Number(row.current_version)))fail(409,'This document changed. Ask your care team for the current version.');
 const saved=version===Number(row.current_version)?current:await versionById(db,row,version);
 const payload=decode(saved.payload_encrypted);
 const {document_key:documentKey}=row;
 const [staffSigners]=decode(signer.details_encrypted).copyOnly&&documentKey==='attendance-verification'
  ?await db.execute("SELECT * FROM clinical_form_signers WHERE plan_id=? AND version=? AND signer_kind='clinician' AND signed_at IS NOT NULL AND revoked_at IS NULL",[row.id,version]):[[]];
 return {row,signer,plan:{id:row.id,clientId:row.client_id,version,documentKey,contentHash:saved.content_hash,
  currentVersion:row.current_version,data:payload.data,template:payload.template,branding:payload.branding,
  mySignerId:signer.id,signers:[signerView(signer),...staffSigners.map(signerView)],reviewStatus:payload.reviewStatus,revocation:currentPayload.revocation||null}};
}

export async function signDirectForm(db,item,input) {
 const {row,signer,plan}=await directFormItem(db,item,{lock:true});
 if(signer.signed_at)return {signed:true};
 if(item.action==='view')fail(400,'This request is for a shared copy.');
 expectVersion(row,input.version);
 if(plan.contentHash!==input.contentHash)fail(409,'Review the current version before signing.');
 if(item.action==='complete')return submitFormUpdate(db,{row,signer,input,userId:null,method:'direct_link'});
 validateClinicalReady(plan.data,plan.template);
 if(plan.template.defaultTermMonths===12&&signer.signer_kind==='guardian'&&!plan.data.representativeAuthority)fail(400,'The release must record your authority to sign.');
 const evidence=signatureEvidence(input,plan.template.title);
 await db.execute("UPDATE clinical_form_signers SET signature_encrypted=?,signed_at=CURRENT_TIMESTAMP,signing_method='direct_link' WHERE id=?",[encode({...evidence,version:plan.version,contentHash:plan.contentHash}),signer.id]);
 await markReleaseForFiling(db,row,true);
 return {signed:true};
}

async function fileReleaseRecipient(row, payload, user) {
 const {recipientName:fullName,recipientEmail:email,recipientPhone:phone,direction}=payload.data;
 if(!fullName || !direction?.some(option=>option!=='Provide a copy to the client'))return;
 const [{default:ClientContactAffiliation},{upsertClientAffiliatedContact}]=await Promise.all([
   import('../../models/ClientContactAffiliation.model.js'),import('../clientContactAffiliation.service.js')
 ]);
 const key=value=>String(value||'').toLowerCase().trim().replace(/\s+/g,' ');
 const normalizePhone=value=>String(value||'').replace(/\D/g,'');
 const existing=(await ClientContactAffiliation.listForClient(row.client_id)).some(contact=>
   key(contact.contact_full_name)===key(fullName)
   && (!email || key(contact.contact_email)===key(email))
   && (!phone || normalizePhone(contact.contact_phone)===normalizePhone(phone)));
 if(!existing)await upsertClientAffiliatedContact({agencyId:row.agency_id,clientId:row.client_id,userId:user.id,fullName,email,phone,importOnly:true});
}

export async function reviewUpdate(user,id,input){
 await transaction(async db=>{const row=await rowById(db,id,true);await planAccess(user,row,{write:true});expectVersion(row,input.version);const previous=decode((await versionById(db,row)).payload_encrypted);
 if(!portalEditableKeys.has(previous.template.key)||previous.reviewStatus!=='pending')fail(400,'Select a submitted form awaiting review.');
 if(input.reviewed!==true)fail(400,'Confirm that you reviewed this submission.');
 if(previous.template.key==='release-of-information'&&!previous.managedSubmission)await fileReleaseRecipient(row,previous,user);
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

export async function portalStartRelease(user,clientId) {
 if(!['client','client_guardian'].includes(user?.role)||user.demoMode||user.switchedFromUserId)fail(403,'Use your own portal account.');
 const {default:Client}=await import('../../models/Client.model.js');
 const client=await Client.findById(positiveId(clientId),{includeSensitive:true});
 if(!client||client.is_archived||['ARCHIVED','TERMINATED','DISCHARGED'].includes(String(client.status).toUpperCase()))fail(404,'This client is unavailable.');
 const row={agency_id:client.agency_id,client_id:client.id,document_key:'release-of-information',current_version:1};
 const kind=user.role==='client'?'client':'guardian';
 const signerName=await recipientAccess(row,user.id,kind);
 const template=await getClinicalTemplate(row.document_key,row.agency_id);
 const shareId=await transaction(async db=>{
  const [insert]=await db.execute('INSERT INTO clinical_form_records(agency_id,client_id,created_by_user_id,document_key) VALUES(?,?,?,?)',
   [row.agency_id,row.client_id,user.id,row.document_key]);
  row.id=insert.insertId;
  const data=normalizeClinicalData({personLabel:client.full_name||client.initials,planDate:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver'}).format(new Date())},template);
  await snapshot(db,row,user,{template,data,branding:await agencyBrand(row.agency_id),reviewStatus:null});
  const [signer]=await db.execute('INSERT INTO clinical_form_signers(plan_id,version,signer_kind,recipient_user_id,details_encrypted,portal_shared_at,delivery_managed) VALUES(?,?,?,?,?,UTC_TIMESTAMP(),1)',
   [row.id,1,kind,user.id,encode({name:signerName,copyOnly:false,allowCompletion:true,managed:true,optional:true})]);
  await event(db,row,user,'optional_release_started');
  return signer.insertId;
 });
 return {shareId};
}

export async function listFiledClinicalForms(user,clientId) {
 const client=await clientAccess(user,clientId);
 const [rows]=await pool.execute(`SELECT r.*,v.version,v.payload_encrypted,current.payload_encrypted AS current_payload,s.signed_at,s.details_encrypted
  FROM clinical_form_records r JOIN clinical_form_versions v ON v.plan_id=r.id
  JOIN clinical_form_signers s ON s.plan_id=v.plan_id AND s.version=v.version
  JOIN clinical_form_versions current ON current.plan_id=r.id AND current.version=r.current_version
  WHERE r.client_id=? AND r.agency_id=? AND s.signed_at IS NOT NULL
  ORDER BY s.signed_at DESC,s.id DESC LIMIT 300`,[client.id,client.agency_id]);
 const forms=[];
 const seen=new Set();
 for(const row of rows){
  try{await planAccess(user,row);}catch(error){if([403,404].includes(error.status))continue;throw error;}
  const key=row.id+':'+row.version;
  if(seen.has(key))continue;
  seen.add(key);
  const payload=decode(row.payload_encrypted);
  const category=row.document_key==='release-of-information'?'Release of information':
   ['portal-screening','client-outcome-measure'].includes(payload.template.source?.kind)||row.document_key==='cssrs-screener'?'Assessment':
   payload.template.source?.kind==='enrollment-foundation'?'Enrollment form':'Clinical form';
  const current=decode(row.current_payload);
  forms.push({id:row.id,version:row.version,title:payload.data.documentName||payload.template.title,category,
   signedAt:row.signed_at,respondent:decode(row.details_encrypted).name,reviewStatus:Number(current.reviewOfVersion)===Number(row.version)?'reviewed':payload.reviewStatus,revoked:!!current.revocation});
 }
 return {forms};
}
