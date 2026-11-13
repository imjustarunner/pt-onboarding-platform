import pool from '../config/database.js';
import {encryptFamilyBilling,decryptFamilyBilling} from './familyBillingEncryption.service.js';
import {serviceStatus,terminalProfile} from '../utils/clientServiceLifecycle.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const context=row=>`service-return:${row.agency_id}:${row.id}`;
export function createClientServiceReturnRequests(overrides={}){
 const d={db:pool,authorize:async(...args)=>(await import('./guardianAppointments.service.js')).authorizedAppointmentClient(...args),encrypt:encryptFamilyBilling,decrypt:decryptFamilyBilling,...overrides};
 const view=row=>row?{id:row.id,status:row.status,createdAt:row.created_at,note:d.decrypt(row.note_encrypted,context(row))?.note||'',response:row.response_encrypted?d.decrypt(row.response_encrypted,context(row))?.message||'':''}:null;
 async function clientContext(input){
  if(!Number.isSafeInteger(Number(input.serviceId))||Number(input.serviceId)<1)throw fail('Choose the provider and service you want the team to review.');
  const client=await d.authorize(input.userId,input.clientId,{agencyId:input.agencyId,serviceId:input.serviceId});
  const [[service]]=await d.db.execute('SELECT * FROM client_service_enrollments WHERE id=? AND client_id=? AND agency_id=?',[input.serviceId,input.clientId,client.agency_id]);
  if(!service||!Number(service.provider_user_id))throw fail('Contact the team to discuss returning to services.',409);
  return service;
 }
 async function read(input){
  const service=await clientContext(input);
  const [[row]]=await d.db.execute('SELECT * FROM client_service_return_requests WHERE service_enrollment_id=? AND requester_user_id=? ORDER BY created_at DESC,id DESC LIMIT 1',[service.id,input.userId]);
  return {request:view(row)};
 }
 async function submit(input){
  const service=await clientContext(input);
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.requestId||''))throw fail('Refresh this form and try again.');
  if(input.note!=null&&typeof input.note!=='string')throw fail('Enter a short note for the team.');
  const note=String(input.note||'').trim()||'Please consider me for services with this provider again.';
  if(note.length>1000)throw fail('Keep your note within 1,000 characters.');
  const db=await d.db.getConnection();
  try{
   await db.beginTransaction();
   const [[current]]=await db.execute('SELECT * FROM client_service_enrollments WHERE id=? AND client_id=? AND agency_id=? FOR UPDATE',[service.id,input.clientId,service.agency_id]);
   if(!current)throw fail('Service not found.',404);
   if(serviceStatus(current)==='active'){
    const [[profile]]=await db.execute('SELECT c.status,s.status_key AS client_status_key FROM clients c LEFT JOIN client_statuses s ON s.id=c.client_status_id WHERE c.id=?',[input.clientId]);
    if(!terminalProfile(profile))throw fail('This service is already active. Refresh your portal to see the available options.',409);
   }
   const [[existing]]=await db.execute('SELECT * FROM client_service_return_requests WHERE id=? FOR UPDATE',[input.requestId]);
   if(existing){if(Number(existing.requester_user_id)!==Number(input.userId)||Number(existing.service_enrollment_id)!==Number(service.id)||d.decrypt(existing.note_encrypted,context(existing))?.note!==note)throw fail('This review request changed. Refresh before submitting again.',409);await db.commit();return {request:view(existing)};}
   const [[pending]]=await db.execute("SELECT * FROM client_service_return_requests WHERE service_enrollment_id=? AND requester_user_id=? AND status='pending' FOR UPDATE",[service.id,input.userId]);
   if(pending){await db.commit();return {request:view(pending)};}
   const row={id:input.requestId,agency_id:service.agency_id};
   await db.execute('INSERT INTO client_service_return_requests (id,client_id,agency_id,service_enrollment_id,provider_user_id,requester_user_id,note_encrypted) VALUES (?,?,?,?,?,?,?)',[row.id,input.clientId,row.agency_id,service.id,service.provider_user_id,input.userId,d.encrypt({note},context(row))]);
   await db.execute(`INSERT INTO notifications (type,severity,title,message,user_id,agency_id,related_entity_type,related_entity_id,actor_user_id,actor_source)
    VALUES ('public_appointment_request_received','info','Client requested services review',?,?,?,'client',?,?,'guardian_portal')`,['A client or authorized guardian asked to be considered for services with you again. Review the request in Services & providers. The request does not reactivate services or book a session.',service.provider_user_id,service.agency_id,input.clientId,input.userId]);
   const [[saved]]=await db.execute('SELECT * FROM client_service_return_requests WHERE id=?',[row.id]);
   await db.commit();return {request:view(saved)};
  }catch(error){await db.rollback();throw error;}finally{db.release();}
 }
 async function list({clientId,agencyId,serviceId}){
  const [rows]=await d.db.execute(`SELECT r.*,CONCAT_WS(' ',u.first_name,u.last_name) AS requester_name FROM client_service_return_requests r
   JOIN client_service_enrollments e ON e.id=r.service_enrollment_id LEFT JOIN users u ON u.id=r.requester_user_id
   WHERE e.id=? AND e.client_id=? AND e.agency_id=? ORDER BY r.created_at DESC,r.id DESC`,[serviceId,clientId,agencyId]);
  return {requests:rows.map(row=>({...view(row),requesterName:row.requester_name}))};
 }
 async function review({clientId,agencyId,serviceId,userId,requestId,decision,message}){
  if(!['reviewed','declined'].includes(decision)||message!=null&&typeof message!=='string'||String(message||'').trim().length>500)throw fail('Choose Reviewed or Declined and keep the client message within 500 characters.');
  const text=String(message||'').trim()||(decision==='declined'?'We are unable to restart services with this provider at this time. Contact our team if you have questions.':'Our team has reviewed your request. Please contact us to discuss next steps.');
  const db=await d.db.getConnection();
  try{
   await db.beginTransaction();
   const [[service]]=await db.execute('SELECT * FROM client_service_enrollments WHERE id=? AND client_id=? AND agency_id=? FOR UPDATE',[serviceId,clientId,agencyId]);
   if(!service)throw fail('Service not found.',404);
   const [[row]]=await db.execute('SELECT * FROM client_service_return_requests WHERE id=? AND service_enrollment_id=? FOR UPDATE',[requestId,serviceId]);
   if(!row)throw fail('Request not found.',404);
   if(row.status!=='pending')throw fail('This request was already reviewed. Refresh to see its current status.',409);
   await db.execute("UPDATE client_service_return_requests SET status=?,pending_key=NULL,response_encrypted=?,reviewed_by_user_id=?,reviewed_at=UTC_TIMESTAMP() WHERE id=? AND status='pending'",[decision,d.encrypt({message:text},context(row)),userId,row.id]);
   await db.commit();return {reviewed:true};
  }catch(error){await db.rollback();throw error;}finally{db.release();}
 }
 return {read,submit,list,review};
}
export const clientServiceReturnRequests=createClientServiceReturnRequests();
