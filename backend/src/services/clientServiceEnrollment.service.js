import pool from '../config/database.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import { requireClinicalScope } from './guardianClinicalAccess.service.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export const SERVICE_KINDS=['counseling','tutoring','coaching','consultation'];
export function serviceMatchesAppointment(service, appointment) {
  if(Number(service.agency_id)!==Number(appointment.agencyId||appointment.agency_id))return false;
  if(service.provider_user_id&&Number(service.provider_user_id)!==Number(appointment.providerUserId||appointment.provider_user_id))return false;
  const kind=appointment.businessType||appointment.business_type;
  return service.service_kind==='tutoring'?['learning','tutoring'].includes(kind):service.service_kind==='counseling'?(!kind||['mental_health','healthcare'].includes(kind)):kind===service.service_kind;
}
export async function clientAgencyMembership(clientId,agencyId,db=pool){
 const [[row]]=await db.execute(`SELECT c.id FROM clients c WHERE c.id=? AND (c.agency_id=? OR EXISTS
 (SELECT 1 FROM client_agency_assignments ca WHERE ca.client_id=c.id AND ca.agency_id=? AND ca.is_active=1))`,[clientId,agencyId,agencyId]);
 return !!row;
}
export async function listClientServices(clientId,agencyId=null,db=pool){
 const [rows]=await db.execute(`SELECT e.*,CONCAT_WS(' ',u.first_name,u.last_name) AS provider_name,o.name AS organization_name
 FROM client_service_enrollments e JOIN clients c ON c.id=e.client_id
 LEFT JOIN users u ON u.id=e.provider_user_id LEFT JOIN agencies o ON o.id=e.organization_id
 WHERE e.client_id=? ${agencyId?'AND e.agency_id=?':''}
 AND (c.agency_id=e.agency_id OR EXISTS (SELECT 1 FROM client_agency_assignments ca WHERE ca.client_id=c.id AND ca.agency_id=e.agency_id AND ca.is_active=1))
 ORDER BY e.is_active DESC,e.label,u.first_name,e.id`,agencyId?[clientId,agencyId]:[clientId]);return rows;
}
export async function guardianCareContexts(client, userId,db=pool){
 if(ClientGuardian.isNoView(client.permissions_json))return [];
 const [agencies]=await db.execute(`SELECT DISTINCT a.id AS agency_id,a.name AS agency_name,a.slug AS agency_slug,a.organization_type,
 COALESCE(NULLIF(a.logo_url,''),CONCAT('/api/',NULLIF(TRIM(LEADING '/' FROM a.logo_path),''))) AS agency_logo_url
 FROM agencies a JOIN clients c ON c.id=? WHERE a.is_active=1 AND (a.id=c.agency_id OR EXISTS
 (SELECT 1 FROM client_agency_assignments ca WHERE ca.client_id=c.id AND ca.agency_id=a.id AND ca.is_active=1))`,[client.client_id]);
 const services=await listClientServices(client.client_id,null,db);
 return agencies.map(a=>({...a,services:services.filter(e=>Number(e.agency_id)===Number(a.agency_id)&&e.is_active)}));
}
export async function guardianServiceContext({userId,clientId,agencyId,serviceId,scope='session_frequency'}){
 const rows=await ClientGuardian.listClientsForGuardian({guardianUserId:userId});
 const client=rows.find(c=>Number(c.client_id)===Number(clientId)&&!ClientGuardian.isNoView(c.permissions_json));
 if(!client)throw fail(403,'This profile is not available to your account.');
 const aid=Number(agencyId||client.agency_id);
 if(!await clientAgencyMembership(clientId,aid))throw fail(403,'This profile is not enrolled with the selected agency.');
 const services=await listClientServices(clientId,aid);
 const service=serviceId?services.find(e=>Number(e.id)===Number(serviceId)&&e.is_active):null;
 if(serviceId&&!service)throw fail(403,'This service is no longer available for this profile.');
 const clinical=service?service.service_kind==='counseling':services.some(e=>e.is_active&&e.service_kind==='counseling')||['clinical','mental_health','school'].includes(client.client_type);
 if(clinical&&scope)await requireClinicalScope({userId,clientId,agencyId:aid,scope});
 return {...client,agency_id:aid,client_type:service?.service_kind==='tutoring'?'learning':service?.service_kind==='counseling'?'clinical':client.client_type,service};
}
export async function saveClientService({clientId,agencyId,input,userId},db=pool){
 if(!await clientAgencyMembership(clientId,agencyId,db))throw fail(400,'Link this client to the agency before adding its service.');
 const serviceKind=String(input.serviceKind||'');
 if(!SERVICE_KINDS.includes(serviceKind))throw fail(400,'Choose a service.');
 const providerId=Number(input.providerUserId)||0,organizationId=Number(input.organizationId)||0;
 if(!Number.isSafeInteger(providerId)||providerId<0||!Number.isSafeInteger(organizationId)||organizationId<0)throw fail(400,'Choose a valid provider and program.');
 if(providerId){const [[provider]]=await db.execute(`SELECT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=?
 WHERE u.id=? AND COALESCE(u.is_active,1)=1 AND COALESCE(ua.is_active,1)=1 AND u.role IN ('provider','provider_plus','clinician','supervisor','intern','intern_plus','clinical_practice_assistant','admin','super_admin')`,[agencyId,providerId]);if(!provider)throw fail(400,'Choose an active provider from this agency.');}
 if(organizationId&&organizationId!==Number(agencyId)){const [[org]]=await db.execute(`SELECT 1 FROM client_organization_assignments co JOIN organization_affiliations oa ON oa.organization_id=co.organization_id WHERE co.client_id=? AND co.organization_id=? AND co.is_active=1 AND oa.agency_id=? AND oa.is_active=1`,[clientId,organizationId,agencyId]);if(!org)throw fail(400,'Choose a linked school or program for this agency.');}
 const label=String(input.label||serviceKind).trim().slice(0,150);if(!label)throw fail(400,'Enter a service name.');
 await db.execute(`INSERT INTO client_service_enrollments (client_id,agency_id,service_kind,provider_user_id,organization_id,label,created_by_user_id,updated_by_user_id)
 VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE label=VALUES(label),is_active=1,updated_by_user_id=VALUES(updated_by_user_id)`,[clientId,agencyId,serviceKind,providerId,organizationId,label,userId,userId]);
 return listClientServices(clientId,agencyId,db);
}

// A real scheduled service or tutoring subject may discover an additional
// enrollment. Never replace another agency/provider or silently reopen an ended
// enrollment; that requires an explicit staff action.
export async function ensureClientService({clientId,agencyId,providerUserId=0,serviceKind},db=pool){
 if(!SERVICE_KINDS.includes(serviceKind)||!await clientAgencyMembership(clientId,agencyId,db))return;
 const [[existing]]=await db.execute('SELECT id FROM client_service_enrollments WHERE client_id=? AND agency_id=? AND service_kind=? AND provider_user_id=? LIMIT 1',[clientId,agencyId,serviceKind,providerUserId||0]);
 if(existing)return;
 await db.execute('INSERT IGNORE INTO client_service_enrollments (client_id,agency_id,service_kind,provider_user_id,label) VALUES (?,?,?,?,?)',[clientId,agencyId,serviceKind,providerUserId||0,serviceKind[0].toUpperCase()+serviceKind.slice(1)]);
}
export async function endProviderCounselingService({clientId,agencyId,providerUserId},db=pool){
 const [services]=await db.execute('SELECT * FROM client_service_enrollments WHERE client_id=? AND is_active=1 FOR UPDATE',[clientId]);
 const ended=services.filter(s=>Number(s.agency_id)===Number(agencyId)&&Number(s.provider_user_id)===Number(providerUserId)&&s.service_kind==='counseling');
 for(const service of ended)await db.execute('UPDATE client_service_enrollments SET is_active=0,updated_by_user_id=? WHERE id=?',[providerUserId,service.id]);
 const remaining=services.filter(s=>!ended.some(e=>Number(e.id)===Number(s.id)));
 if(remaining.length){
  if(!remaining.some(s=>Number(s.provider_user_id)===Number(providerUserId))){
   await db.execute('UPDATE client_provider_assignments SET is_active=0,is_primary=0,updated_by_user_id=? WHERE client_id=? AND provider_user_id=?',[providerUserId,clientId,providerUserId]);
   await db.execute('UPDATE clients SET provider_id=NULL,service_day=NULL WHERE id=? AND provider_id=?',[clientId,providerUserId]);
  }
  await db.execute("INSERT INTO client_status_history (client_id,changed_by_user_id,field_changed,from_value,to_value,note) VALUES (?,?,'service_enrollment','active','ended',?)",[clientId,providerUserId,'Counseling service ended; other active services remain.']);
 }
 return {remainingActive:remaining.length};
}
