import pool from '../config/database.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import IntakeLink from '../models/IntakeLink.model.js';
import IntakeSubmission from '../models/IntakeSubmission.model.js';
import IntakeSubmissionClient from '../models/IntakeSubmissionClient.model.js';
import {submissionArtifactsComplete} from './enrollmentSubmissionRoster.service.js';
import AgencyOfficeIntakeMaster from '../models/AgencyOfficeIntakeMaster.model.js';
import {currentClientUpdateRecipient,sendReenrollmentUpdate} from './clientUpdate.service.js';
import {authorizedAppointmentClient} from './guardianAppointments.service.js';
const fail=(message,status=409)=>Object.assign(new Error(message),{status});
const parse=value=>typeof value==='string'?JSON.parse(value):value;
export function reenrollmentPacket(base){
 const steps=(parse(base?.intake_steps)||[]).filter(s=>!['registration','provider_selection'].includes(s.type));
 const documents=steps.filter(s=>s.type==='document'&&Number(s.templateId||s.template_id)>0).map(s=>({id:Number(s.templateId||s.template_id),title:s.title||'Required agreement'}));
 if(!documents.length)throw fail('Publish the current office enrollment documents before sending a re-enrollment package.');
 for(const type of ['insurance_info','communications'])if(!steps.some(s=>s.type===type))steps.push({type,title:type==='communications'?'Confirm communication details':'Confirm insurance and payment details'});
 return {documents,steps,fields:parse(base.intake_fields)||[],allowedDocumentTemplateIds:documents.map(d=>d.id),language:base.language_code||'en'};
}
export function createClientReenrollment(overrides={}){
 const d={db:pool,submissions:IntakeSubmission,submissionClients:IntakeSubmissionClient,artifacts:submissionArtifactsComplete,contacts:id=>ClientGuardian.listForClient(id),recipient:currentClientUpdateRecipient,send:sendReenrollmentUpdate,authorize:authorizedAppointmentClient,
  master:async agencyId=>{const master=await AgencyOfficeIntakeMaster.getOrCreateForAgency(agencyId,{languageCode:'en'});if(!master?.published_intake_link_id)throw fail('Publish the current office enrollment packet first.');return AgencyOfficeIntakeMaster.applyMasterToLink(await IntakeLink.findById(master.published_intake_link_id),{agencyId});},...overrides};
 async function services({clientId,agencyId,providerUserId}){
  const [rows]=await d.db.execute(`SELECT e.*,CONCAT_WS(' ',u.first_name,u.last_name) provider_name FROM client_service_enrollments e LEFT JOIN users u ON u.id=e.provider_user_id
   WHERE e.client_id=? AND e.agency_id=? AND e.is_active=0 ${providerUserId?'AND e.provider_user_id=?':''} ORDER BY e.ended_at DESC,e.id DESC`,[clientId,agencyId,...(providerUserId?[providerUserId]:[])]);return rows;
 }
 async function options(input){
  const rows=await services(input),contacts=[];
  for(const contact of await d.contacts(input.clientId)){
   try{const result=await d.recipient({agencyId:input.agencyId,clientId:input.clientId,to:contact.email,guardianUserId:contact.guardian_user_id,reenrollment:true});contacts.push({id:Number(result.recipient.guardian_user_id),name:[contact.first_name,contact.last_name].filter(Boolean).join(' ')||'Portal contact',email:result.recipient.email});}catch(error){if(![403,409].includes(error.status))throw error;}
  }
  const packet=reenrollmentPacket(await d.master(input.agencyId));
  return {services:rows.map(s=>({id:Number(s.id),label:s.label,providerName:s.provider_name})),contacts,documents:packet.documents,confirmation:'The client must review current contact, insurance/payment, and communication details. Signing does not reactivate care or book sessions.'};
 }
 async function send(input){
  const {clientId,agencyId,userId,providerUserId}=input,body=input.input||{};
  if(body.confirmed!==true||!(/^[a-zA-Z0-9_-]{16,64}$/.test(body.requestKey||'')))throw fail('Review and confirm the package before sending.',400);
  const service=(await services({clientId,agencyId,providerUserId})).find(s=>Number(s.id)===Number(body.serviceId));
  if(!service)throw fail('Choose a past provider service in this client’s record.',403);
  const contact=(await d.contacts(clientId)).find(c=>Number(c.guardian_user_id)===Number(body.recipientUserId));
  if(!contact)throw fail('Choose a current portal contact in this client’s record.',403);
  const {recipient}=await d.recipient({agencyId,clientId,to:contact?.email,guardianUserId:body.recipientUserId,reenrollment:true});
  const conn=await d.db.getConnection();let locked=false;
  try{
   const [[got]]=await conn.execute('SELECT GET_LOCK(?,8) acquired',[`reenroll:${clientId}`]);locked=Number(got?.acquired)===1;if(!locked)throw fail('This client’s package is being prepared. Retry shortly.');
   const [[prior]]=await conn.execute('SELECT * FROM client_update_requests WHERE created_by_user_id=? AND reenrollment_request_key=?',[userId,body.requestKey]);
   if(prior){if(Number(prior.client_id)!==Number(clientId)||Number(prior.agency_id)!==Number(agencyId)||Number(prior.service_enrollment_id)!==Number(service.id)||Number(prior.guardian_user_id)!==Number(recipient.guardian_user_id))throw fail('This request belongs to another package. Reopen the form.');if(prior.status!=='draft')return {id:prior.id,status:prior.status,alreadyCreated:true};return d.send(prior.id,{actorUserId:userId,guardianEmail:recipient.email});}
   const [[pending]]=await conn.execute("SELECT id FROM client_update_requests WHERE client_id=? AND agency_id=? AND service_enrollment_id=? AND guardian_user_id=? AND purpose='reenrollment' AND status IN ('draft','sent','in_progress') LIMIT 1",[clientId,agencyId,service.id,recipient.guardian_user_id]);
   if(pending)throw fail('A re-enrollment package is already open for this contact and service. Review its delivery and progress before sending another.');
   const packet=reenrollmentPacket(await d.master(agencyId));
   await conn.beginTransaction();
   let id;
   try{
    const [created]=await conn.execute("INSERT INTO client_update_requests (agency_id,client_id,guardian_user_id,status,created_by_user_id,purpose,service_enrollment_id,reenrollment_request_key,packet_config_json) VALUES (?,?,?,'draft',?,'reenrollment',?,?,?)",[agencyId,clientId,recipient.guardian_user_id,userId,service.id,body.requestKey,JSON.stringify(packet)]);id=created.insertId;
    for(const document of packet.documents)await conn.execute('INSERT INTO client_update_items (request_id,item_type,reference_key,title) VALUES (?,\'document\',?,?)',[id,String(document.id),document.title]);
    await conn.commit();
   }catch(error){await conn.rollback();throw error;}
   return d.send(id,{actorUserId:userId,guardianEmail:recipient.email});
  }finally{try{if(locked)await conn.execute('SELECT RELEASE_LOCK(?)',[`reenroll:${clientId}`]);}finally{conn.release();}}
 }
 async function list(input){
  const client=await d.authorize(input.userId,input.clientId,{agencyId:input.agencyId,serviceId:input.serviceId});
  const [rows]=await d.db.execute(`SELECT r.id,r.status,r.sent_at,r.created_at,r.packet_public_key,r.service_enrollment_id,r.packet_config_json,
   EXISTS(SELECT 1 FROM intake_submissions s JOIN intake_links l ON l.id=s.intake_link_id WHERE CAST(l.public_key AS BINARY)=CAST(r.packet_public_key AS BINARY) AND s.client_id=r.client_id AND s.guardian_user_id=r.guardian_user_id AND s.status='submitted') submitted
   FROM client_update_requests r WHERE r.purpose='reenrollment' AND r.client_id=? AND r.agency_id=? AND r.guardian_user_id=? ${input.serviceId?'AND r.service_enrollment_id=?':''} ORDER BY r.id DESC LIMIT 20`,[input.clientId,client.agency_id,input.userId,...(input.serviceId?[input.serviceId]:[])]);
  const allowed=new Set((client.services||client.authorizedServices||[]).map(s=>Number(s.id)));
  return {packages:rows.filter(r=>allowed.has(Number(r.service_enrollment_id))&&['sent','in_progress','completed'].includes(r.status)).map(row=>({id:row.id,status:row.submitted?'submitted':row.status,sentAt:row.sent_at,documents:(parse(row.packet_config_json)?.documents||[]),path:row.packet_public_key&&!row.submitted?`/intake/${encodeURIComponent(row.packet_public_key)}`:null}))};
 }
 async function pastProviders(input){
  const client=await d.authorize(input.userId,input.clientId,{agencyId:input.agencyId});
  const allowed=new Map((client.services||[]).map(s=>[Number(s.id),s]));
  const [history]=await d.db.execute('SELECT h.*,CONCAT_WS(\' \',u.first_name,u.last_name) provider_name FROM client_service_provider_history h LEFT JOIN users u ON u.id=h.provider_user_id WHERE h.client_id=? AND h.agency_id=? ORDER BY h.ended_at DESC,h.id DESC',[input.clientId,client.agency_id]);
  const current=[...allowed.values()].filter(s=>Number(s.is_active)!==1);
  const records=[...current.map(s=>({...s,service_enrollment_id:s.id,key:'service-'+s.id,recorded_at:s.created_at})),...history.filter(h=>allowed.has(Number(h.service_enrollment_id))&&!current.some(s=>Number(s.id)===Number(h.service_enrollment_id)&&String(s.ended_at)===String(h.ended_at))).map(h=>({...h,key:'history-'+h.id}))];
  const providers=records.map(s=>({id:s.key,serviceId:Number(s.service_enrollment_id),label:s.label,providerName:s.provider_name,providerUserId:s.provider_user_id,statusLabel:s.closure_reason==='discontinued_contact'?'Discontinued services':({completed:'Completed services',terminated:'Terminated services',canceled:'Canceled services'})[s.service_status]||'Discontinued services',reason:s.client_end_reason,recordedAt:s.recorded_at,endedAt:s.ended_at,currentServiceActive:Number(allowed.get(Number(s.service_enrollment_id))?.is_active)===1}));
  // Older assignment records may predate service enrollments. Show the recorded
  // fact without inventing a service type, termination reason or exact end date.
  if(!client.authorizedServices){
   const [legacy]=await d.db.execute(`SELECT p.provider_user_id,MIN(p.created_at) recorded_at,CONCAT_WS(' ',u.first_name,u.last_name) provider_name
    FROM client_provider_assignments p LEFT JOIN users u ON u.id=p.provider_user_id WHERE p.client_id=? AND p.is_active=0
    AND (p.organization_id=? OR EXISTS(SELECT 1 FROM organization_affiliations f WHERE f.organization_id=p.organization_id AND f.agency_id=?))
    AND NOT EXISTS(SELECT 1 FROM client_provider_assignments active_assignment WHERE active_assignment.client_id=p.client_id AND active_assignment.provider_user_id=p.provider_user_id AND active_assignment.is_active=1)
    GROUP BY p.provider_user_id,u.first_name,u.last_name`,[input.clientId,client.agency_id,client.agency_id]);
   for(const old of Array.isArray(legacy)?legacy:[])if(!providers.some(p=>Number(p.providerUserId)===Number(old.provider_user_id)))providers.push({id:`assignment-${old.provider_user_id}`,serviceId:null,label:'Previous provider assignment',providerName:old.provider_name,providerUserId:old.provider_user_id,statusLabel:'Past provider',recordedAt:old.recorded_at,endedAt:null});
  }
  return {providers};
 }
 async function packetAccess(user,key){
  const [[row]]=await d.db.execute("SELECT * FROM client_update_requests WHERE packet_public_key=? AND purpose='reenrollment' LIMIT 1",[key]);
  if(!row)return null;
  if(!user?.id||Number(user.id)!==Number(row.guardian_user_id)||!['sent','in_progress','completed'].includes(row.status))throw fail('Sign in to the account invited to complete this package.',403);
  const client=await d.authorize(user.id,row.client_id,{agencyId:row.agency_id,serviceId:row.service_enrollment_id});
  const contact=(await d.contacts(row.client_id)).find(c=>Number(c.guardian_user_id)===Number(user.id));
  await d.recipient({agencyId:row.agency_id,clientId:row.client_id,to:contact?.email,guardianUserId:user.id,reenrollment:true});
  return {...row,expectedClient:{id:row.client_id,full_name:client.full_name,date_of_birth:client.date_of_birth}};
 }
 async function completeSubmitted(){
  const [rows]=await d.db.execute(`SELECT r.id,r.client_id,r.guardian_user_id,s.id submission_id FROM client_update_requests r JOIN intake_links l ON CAST(l.public_key AS BINARY)=CAST(r.packet_public_key AS BINARY)
   JOIN intake_submissions s ON s.intake_link_id=l.id AND s.client_id=r.client_id AND s.guardian_user_id=r.guardian_user_id AND s.status='submitted'
   WHERE r.purpose='reenrollment' AND r.status IN ('sent','in_progress') ORDER BY r.id DESC LIMIT 25`);
  for(const candidate of rows){
   const submission=await d.submissions.findById(candidate.submission_id),roster=await d.submissionClients.listBySubmissionId(candidate.submission_id);
   if(!submission||!d.artifacts(submission,roster,1))continue;
   const conn=await d.db.getConnection();try{await conn.beginTransaction();
    const [[row]]=await conn.execute("SELECT * FROM client_update_requests WHERE id=? AND purpose='reenrollment' FOR UPDATE",[candidate.id]);
    if(!row||!['sent','in_progress'].includes(row.status)){await conn.commit();continue;}
    await conn.execute("UPDATE client_update_requests SET status='completed',completed_at=UTC_TIMESTAMP() WHERE id=?",[row.id]);
    await conn.execute(`INSERT INTO notifications (type,severity,title,message,user_id,agency_id,related_entity_type,related_entity_id,actor_source)
     SELECT DISTINCT 'client_assigned','info','Re-enrollment package ready for review',?,u.id,?,'client',?,'care_reenrollment'
     FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
     WHERE u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND (u.id=? OR u.role IN ('admin','support','super_admin') OR u.id=(SELECT provider_user_id FROM client_service_enrollments WHERE id=?))`,['The current package and its documents have been submitted to the existing client file. Review current details and care readiness before explicitly reactivating or scheduling. Services remain closed.',row.agency_id,row.client_id,row.agency_id,row.created_by_user_id,row.service_enrollment_id]);
    await conn.commit();
   }catch(error){await conn.rollback();throw error;}finally{conn.release();}
  }
 }
 return {options,send,list,packetAccess,pastProviders,completeSubmitted};
}
export const clientReenrollment=createClientReenrollment();
