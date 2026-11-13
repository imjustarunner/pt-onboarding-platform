import pool from '../config/database.js';
import {serviceMatchesAppointment,guardianCareContexts} from './clientServiceEnrollment.service.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
const allowedRead=/^\/(?:past-providers|reenrollment|service-access|session-history(?:\/download)?|appointments|services\/\d+\/return-request|intake-documents(?:\/[^/]+\/download-url)?|enrollment-copies\/[^/]+\/download|cancellations\/[^/]+(?:\/feedback)?)\/?$/;
export function limitedServiceRouteAllowed(method,path){return method==='GET'&&allowedRead.test(path)||method==='POST'&&/^\/(?:cancellations\/[^/]+\/feedback|services\/\d+\/return-request)\/?$/.test(path);}
const fail=(message,status=403)=>Object.assign(new Error(message),{status,code:'SERVICE_PORTAL_LIMITED'});
export function limitedGlobalRouteAllowed(method,path){
 return method==='GET'&&/^\/(?:overview|clients|account)\/?$/.test(path)||method==='PUT'&&/^\/account\/?$/.test(path)
  ||['GET','POST'].includes(method)&&/^\/support-tickets(?:\/[^/]+(?:\/messages)?)?\/?$/.test(path)||method==='POST'&&/^\/technology-help\/?$/.test(path);
}
export function createGlobalServicePortalGate(overrides={}){
 const d={profiles:userId=>ClientGuardian.listClientsForGuardian({guardianUserId:userId}),contexts:guardianCareContexts,client:guardianServiceClient,...overrides};
 return async(req,res,next)=>{try{
  if(req.guardianPreviewMode||/^\/clients\/\d+(?:\/|$)/.test(req.path)||limitedGlobalRouteAllowed(req.method,req.path))return next();
  const dependent=req.path.match(/^\/dependents\/(\d+)/)?.[1];
  const targets=[req.query.clientId,req.body?.clientId,dependent,...(Array.isArray(req.body?.clientIds)?req.body.clientIds:[]),...(Array.isArray(req.body?.dependentClientIds)?req.body.dependentClientIds:[])].map(Number).filter(n=>Number.isSafeInteger(n)&&n>0);
  if(targets.length){for(const clientId of new Set(targets)){const client=await d.client({userId:req.user.id,clientId,agencyId:req.query.agencyId||req.body?.agencyId,serviceId:req.query.serviceId||req.body?.serviceId});if(client.portal_access?.limited)throw fail('This service has ended. Active-care features and new session requests are unavailable. Billing, records, and account support remain available.');}}
  else{const profiles=await d.profiles(req.user.id);const contexts=(await Promise.all(profiles.map(p=>d.contexts(p,req.user.id)))).flat();if(contexts.length&&contexts.every(c=>c.portal_access?.limited))throw fail('Your services have ended. This portal is limited to billing, receipts, records, and account support.');}
  next();
 }catch(error){next(error);}};
}
export const globalServicePortalGate=createGlobalServicePortalGate();
export async function guardianServiceClient({userId,clientId,agencyId,serviceId}){
 const {authorizedClient}=await import('./guardianAppointments.service.js');
 return authorizedClient(userId,clientId,null,{agencyId,serviceId,allowEndedServices:true});
}
export async function guardianServiceAccess(input){
 const client=await guardianServiceClient(input);
 return {access:client.portal_access||{limited:false,status:'active',statusLabel:'Active services'},services:(client.services||[]).map(s=>({id:s.id,label:s.label,providerName:s.provider_name,status:s.portal_status||s.service_status,statusLabel:s.portal_status_label||s.status_label,reason:s.client_end_reason||null,endedAt:s.ended_at}))};
}
export async function servicePortalGate(req,res,next){
 try{
  if(req.guardianPreviewMode)return next();
  const client=await guardianServiceClient({userId:req.user.id,clientId:Number(req.params.clientId),agencyId:req.query.agencyId||req.body?.agencyId,serviceId:req.query.serviceId||req.body?.serviceId});
  req.servicePortalClient=client;
  if(!client.portal_access?.limited)return next();
  if(!limitedServiceRouteAllowed(req.method,req.path))throw fail('This service has ended. You can still access billing, receipts, session history, signed documents, and account support. Future booking and care requests are unavailable.');
  if(req.method==='GET'&&/^\/appointments\/?$/.test(req.path))return res.set('Cache-Control','private, no-store').json({appointments:[],serviceAccess:client.portal_access});
  next();
 }catch(error){next(error);}
}
const csvCell=value=>{let s=String(value??'');if(/^[=+\-@]/.test(s.trimStart())||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
export function sessionHistoryCsv(rows){
 return '\uFEFF'+[['Reference','Start (UTC)','End (UTC)','Time zone','Provider','Service','Status','Format'],...rows.map(a=>[a.id,a.startAt,a.endAt,a.timeZone,a.providerName,a.service,a.status,a.modality])].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
export async function guardianSessionHistory(input,db=pool,{authorize}={}){
 const {authorizedAppointmentClient}=await import('./guardianAppointments.service.js');
 const client=await (authorize||authorizedAppointmentClient)(input.userId,input.clientId,input);
 const [rows]=await db.execute(`SELECT DISTINCT a.id,a.agency_id AS agencyId,a.provider_user_id AS providerUserId,a.business_type AS businessType,
   a.start_at AS startAt,a.end_at AS endAt,a.source_timezone AS timeZone,a.status,a.modality,CONCAT_WS(' ',u.first_name,u.last_name) AS providerName
   FROM appointments a JOIN appointment_participants p ON p.appointment_id=a.id AND p.client_id=? LEFT JOIN users u ON u.id=a.provider_user_id
   WHERE a.agency_id=? AND a.status<>'draft' AND (a.start_at<=UTC_TIMESTAMP() OR a.status IN ('canceled_by_client','canceled_by_guardian','canceled_by_provider','canceled_by_organization','late_canceled','rescheduled'))
   ORDER BY a.start_at DESC,a.id DESC`,[input.clientId,client.agency_id]);
 return rows.filter(a=>client.service?serviceMatchesAppointment(client.service,a):client.authorizedServices?client.authorizedServices.some(s=>serviceMatchesAppointment(s,a)):true)
  .map(a=>({id:a.id,startAt:a.startAt instanceof Date?a.startAt.toISOString():a.startAt,endAt:a.endAt instanceof Date?a.endAt.toISOString():a.endAt,timeZone:a.timeZone||'America/Denver',providerName:a.providerName,
    service:({mental_health:'Counseling',healthcare:'Counseling',learning:'Tutoring',tutoring:'Tutoring',coaching:'Coaching',consultation:'Consultation',consulting:'Consultation'})[a.businessType]||'Session',status:a.status,modality:a.modality}));
}
