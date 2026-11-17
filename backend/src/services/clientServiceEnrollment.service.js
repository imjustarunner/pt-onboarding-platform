import pool from '../config/database.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import { requireClinicalScope } from './guardianClinicalAccess.service.js';
import {guardianServiceRestrictions,guardianServiceAllowed} from '../utils/guardianServiceRestrictions.js';
import {decorateService,servicePortalAccess,serviceStatus,SERVICE_STATUSES,SERVICE_CLOSURE_REASONS,terminalProfile} from '../utils/clientServiceLifecycle.js';
import {withClientSchedulingLock} from './clientSchedulingGuard.service.js';
import {appointmentServiceKind} from '../utils/guardianCancellationScope.js';
import { assertAssignableProvider } from './clientAssignmentScope.service.js';
import { clientServiceAssignments } from '../utils/clientServiceAssignments.js';
import { clientServiceKindsForAgency } from './clientServiceCatalog.service.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export const SERVICE_KINDS=['counseling','tutoring','coaching','consultation'];

async function withClientServiceLock(clientId, db, action) {
 const ownConnection=db===pool&&typeof db.getConnection==='function';
 const connection=ownConnection?await db.getConnection():db;
 try {
  if(ownConnection)await connection.beginTransaction();
  // The client row serializes first enrollment creation as well as later edits.
  await connection.execute('SELECT id FROM clients WHERE id=? FOR UPDATE',[clientId]);
  const result=await action(connection);
  if(ownConnection)await connection.commit();
  return result;
 }catch(error){if(ownConnection)await connection.rollback();throw error;}
 finally{if(ownConnection)connection.release();}
}
export function serviceMatchesAppointment(service, appointment) {
  const selected=Number(appointment.learningContext?.serviceEnrollmentId||0);
  if(selected&&selected!==Number(service.id))return false;
  if(Number(service.agency_id)!==Number(appointment.agencyId||appointment.agency_id))return false;
  // An explicitly unassigned service is not a wildcard for another team's work.
  if(!Number(service.provider_user_id)||Number(service.provider_user_id)!==Number(appointment.providerUserId||appointment.provider_user_id))return false;
  return service.service_kind===appointmentServiceKind(appointment);
}
export function guardianContextAllowsAppointment(client,appointment){
 if(client.service)return serviceMatchesAppointment(client.service,appointment);
 if(client.authorizedServices)return client.authorizedServices.some(service=>serviceMatchesAppointment(service,appointment));
 return true;
}
export async function clientAgencyMembership(clientId,agencyId,db=pool){
 const [[row]]=await db.execute(`SELECT c.id FROM clients c WHERE c.id=? AND (c.agency_id=? OR EXISTS
 (SELECT 1 FROM client_agency_assignments ca WHERE ca.client_id=c.id AND ca.agency_id=? AND ca.is_active=1))`,[clientId,agencyId,agencyId]);
 return !!row;
}
export async function listClientServices(clientId,agencyId=null,db=pool){
 const [rows]=await db.execute(`SELECT e.*,CONCAT_WS(' ',u.first_name,u.last_name) AS provider_name,o.name AS organization_name,o.organization_type
 FROM client_service_enrollments e JOIN clients c ON c.id=e.client_id
 LEFT JOIN users u ON u.id=e.provider_user_id LEFT JOIN agencies o ON o.id=e.organization_id
 WHERE e.client_id=? ${agencyId?'AND e.agency_id=?':''}
 AND (c.agency_id=e.agency_id OR EXISTS (SELECT 1 FROM client_agency_assignments ca WHERE ca.client_id=c.id AND ca.agency_id=e.agency_id AND ca.is_active=1))
 ORDER BY e.is_active DESC,e.label,u.first_name,e.id`,agencyId?[clientId,agencyId]:[clientId]);return (Array.isArray(rows)?rows:[]).map(decorateService);
}
export async function guardianCareContexts(client, userId,db=pool){
 if(ClientGuardian.isNoView(client.permissions_json))return [];
 const [agencies]=await db.execute(`SELECT DISTINCT a.id AS agency_id,a.name AS agency_name,a.slug AS agency_slug,a.organization_type,
 COALESCE(NULLIF(a.logo_url,''),CONCAT('/api/',NULLIF(TRIM(LEADING '/' FROM a.logo_path),''))) AS agency_logo_url
 FROM agencies a JOIN clients c ON c.id=? WHERE a.is_active=1 AND (a.id=c.agency_id OR EXISTS
 (SELECT 1 FROM client_agency_assignments ca WHERE ca.client_id=c.id AND ca.agency_id=a.id AND ca.is_active=1))`,[client.client_id]);
 const restriction=guardianServiceRestrictions(client);
 const services=(await listClientServices(client.client_id,null,db)).filter(service=>guardianServiceAllowed(client,service));
 return agencies.map(a=>{const own=services.filter(e=>Number(e.agency_id)===Number(a.agency_id));return {...a,services:own.map(s=>({...s,service_status:s.portal_status,status_label:s.portal_status_label})),portal_access:servicePortalAccess(client,own)};}).filter(context=>!restriction||context.services.length>0);
}
export async function guardianServiceContext({userId,clientId,agencyId,serviceId,scope='session_frequency',allowEndedServices=false}){
 const rows=await ClientGuardian.listClientsForGuardian({guardianUserId:userId});
 const client=rows.find(c=>Number(c.client_id)===Number(clientId)&&!ClientGuardian.isNoView(c.permissions_json));
 if(!client)throw fail(403,'This profile is not available to your account.');
 const aid=Number(agencyId||client.agency_id);
 const restriction=guardianServiceRestrictions(client);
 if(restriction&&!restriction.agencyIds.includes(aid))throw fail(403,'This agency is not included in your learning portal access.');
 if(!await clientAgencyMembership(clientId,aid))throw fail(403,'This profile is not enrolled with the selected agency.');
 const services=(await listClientServices(clientId,aid)).filter(service=>guardianServiceAllowed(client,service));
 const service=serviceId?services.find(e=>Number(e.id)===Number(serviceId)&&(e.is_active||allowEndedServices)):null;
 if(serviceId&&!service)throw fail(403,'This service is no longer available for this profile.');
 const portalAccess=servicePortalAccess(client,services,serviceId);
 if(portalAccess.limited&&!allowEndedServices)throw Object.assign(fail(403,'This service has ended. Your portal is limited to billing, receipts, records, and account support.'),{code:'SERVICE_PORTAL_LIMITED'});
 if(restriction&&!services.some(service=>service.is_active||allowEndedServices))throw fail(403,'No authorized learning service is currently active for this profile.');
 const clinical=service?service.service_kind==='counseling':services.some(e=>e.is_active&&e.service_kind==='counseling')||(!restriction&&['clinical','mental_health','school'].includes(client.client_type));
 if(clinical&&scope)await requireClinicalScope({userId,clientId,agencyId:aid,scope});
 return {...client,agency_id:aid,portal_access:portalAccess,services,client_type:service?.service_kind==='tutoring'||(restriction&&restriction.kinds.every(kind=>kind==='tutoring'))?'learning':service?.service_kind==='counseling'?'clinical':client.client_type,service,...(restriction?{authorizedServices:services.filter(service=>service.is_active||allowEndedServices)}:{})};
}
export async function saveClientService(context,db=pool){
 if(context.input.serviceKind==='counseling'||context.input.addProvider===true)return withClientServiceLock(context.clientId,db,connection=>saveClientServiceRow(context,connection));
 return saveClientServiceRow(context,db);
}
async function saveClientServiceRow({clientId,agencyId,input,userId},db){
 if(!await clientAgencyMembership(clientId,agencyId,db))throw fail(400,'Link this client to the agency before adding its service.');
 const serviceKind=String(input.serviceKind||'');
 if(!SERVICE_KINDS.includes(serviceKind))throw fail(400,'Choose a service.');
 const providerId=input.providerUserId==null||input.providerUserId===''?0:Number(input.providerUserId),organizationId=input.organizationId==null||input.organizationId===''?0:Number(input.organizationId);
 if(!Number.isSafeInteger(providerId)||providerId<0||!Number.isSafeInteger(organizationId)||organizationId<0)throw fail(400,'Choose a valid provider and program.');
 if(providerId)await assertAssignableProvider({clientId,providerUserId:providerId,agencyId},db);
 if(organizationId&&organizationId!==Number(agencyId)){const [[org]]=await db.execute(`SELECT 1 FROM client_organization_assignments co JOIN organization_affiliations oa ON oa.organization_id=co.organization_id WHERE co.client_id=? AND co.organization_id=? AND co.is_active=1 AND oa.agency_id=? AND oa.is_active=1`,[clientId,organizationId,agencyId]);if(!org)throw fail(400,'Choose a linked school or program for this agency.');}
 const label=serviceKind==='counseling'?'Counseling':String(input.label||serviceKind).trim().slice(0,150);if(!label)throw fail(400,'Enter a service name.');
 const serviceId=input.serviceId == null ? null : Number(input.serviceId);
 if(serviceId!==null&&(!Number.isSafeInteger(serviceId)||serviceId<1))throw fail(400,'Choose a valid service enrollment.');
 if(!serviceId && !(await clientServiceKindsForAgency(agencyId,db)).includes(serviceKind))throw fail(400,'This service is not enabled for this agency.');
 if(serviceId){
  const [[existing]]=await db.execute('SELECT id,service_kind,label,organization_id FROM client_service_enrollments WHERE id=? AND client_id=? AND agency_id=? AND is_active=1',[serviceId,clientId,agencyId]);
  if(!existing)throw fail(404,'Service enrollment not found for this client and agency.');
  if(existing.service_kind && existing.service_kind!==serviceKind)throw fail(400,'Edit the provider for the existing service or add a different service.');
  if(input.addProvider===true){
   if(!providerId)throw fail(400,'Choose an additional provider.');
   const [assigned]=await db.execute('SELECT provider_user_id FROM client_service_enrollments WHERE client_id=? AND agency_id=? AND service_kind=? AND label=? AND is_active=1',[clientId,agencyId,serviceKind,label]);
   if(assigned.some(row=>Number(row.provider_user_id)===providerId))return listClientServices(clientId,agencyId,db);
  const [ended]=await db.execute('SELECT id AS ended_service_id FROM client_service_enrollments WHERE client_id=? AND agency_id=? AND provider_user_id=? AND service_kind=? AND is_active=0 LIMIT 1',[clientId,agencyId,providerId,serviceKind]);
  if(ended?.[0]?.ended_service_id)throw fail(409,'This service was ended. Use Change status to explicitly reactivate it before adding another enrollment with this provider.');
   await db.execute(`INSERT INTO client_service_enrollments (client_id,agency_id,service_kind,provider_user_id,organization_id,label,created_by_user_id,updated_by_user_id)
    VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE updated_by_user_id=VALUES(updated_by_user_id)`,[clientId,agencyId,serviceKind,providerId,Number(existing.organization_id)||0,label,userId,userId]);
   return listClientServices(clientId,agencyId,db);
  }
  try {
   await db.execute(`UPDATE client_service_enrollments SET service_kind=?,provider_user_id=?,organization_id=?,label=?,updated_by_user_id=? WHERE id=? AND client_id=? AND agency_id=?`,[serviceKind,providerId,organizationId,label,userId,serviceId,clientId,agencyId]);
  }catch(error){if(error?.code==='ER_DUP_ENTRY')throw fail(409,'This provider already has a matching service enrollment. Review the existing assignments before changing this service.');throw error;}
 }else{
  if(serviceKind==='counseling'){
   const [existing]=await db.execute("SELECT id,provider_user_id,organization_id FROM client_service_enrollments WHERE client_id=? AND agency_id=? AND service_kind='counseling' AND is_active=1 ORDER BY id",[clientId,agencyId]);
   if(existing.length){
    // Retried creates are idempotent; all other changes go through the one existing service.
    if(existing.some(row=>Number(row.provider_user_id)===providerId&&Number(row.organization_id)===organizationId))return listClientServices(clientId,agencyId,db);
    throw fail(409,'Counseling already exists for this agency. Update its provider assignment instead.');
   }
  }
  const [ended]=await db.execute('SELECT id AS ended_service_id FROM client_service_enrollments WHERE client_id=? AND agency_id=? AND provider_user_id=? AND service_kind=? AND is_active=0 LIMIT 1',[clientId,agencyId,providerId,serviceKind]);
  if(ended?.[0]?.ended_service_id)throw fail(409,'This service was ended. Use Change status to explicitly reactivate it before adding another enrollment with this provider.');
  await db.execute(`INSERT INTO client_service_enrollments (client_id,agency_id,service_kind,provider_user_id,organization_id,label,created_by_user_id,updated_by_user_id)
  VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE label=VALUES(label),updated_by_user_id=VALUES(updated_by_user_id)`,[clientId,agencyId,serviceKind,providerId,organizationId,label,userId,userId]);
 }
 return listClientServices(clientId,agencyId,db);
}

// A real scheduled service or tutoring subject may discover an additional
// enrollment. Never replace another agency/provider or silently reopen an ended
// enrollment; that requires an explicit staff action.
export async function ensureClientService({clientId,agencyId,providerUserId=0,serviceKind,userId=null},db=pool){
 if(!SERVICE_KINDS.includes(serviceKind)||!await clientAgencyMembership(clientId,agencyId,db))return;
 if(serviceKind==='counseling')return withClientServiceLock(clientId,db,async connection=>{
  const [services]=await connection.execute("SELECT id,provider_user_id,organization_id,is_active FROM client_service_enrollments WHERE client_id=? AND agency_id=? AND service_kind='counseling' ORDER BY organization_id DESC,id",[clientId,agencyId]);
  // An ended enrollment remains ended until staff explicitly add the service again.
  if(services.some(row=>Number(row.provider_user_id)===Number(providerUserId)))return;
  const active=services.filter(row=>Number(row.is_active)===1);
  if(services.length&&!active.length)return;
  if(!providerUserId&&active.length)return;
  const placeholder=active.find(row=>!Number(row.provider_user_id));
  if(placeholder&&providerUserId){
   await connection.execute('UPDATE client_service_enrollments SET provider_user_id=?,updated_by_user_id=? WHERE id=? AND client_id=? AND agency_id=? AND is_active=1 AND provider_user_id=0',[providerUserId,userId,placeholder.id,clientId,agencyId]);
   return;
  }
  await connection.execute("INSERT IGNORE INTO client_service_enrollments (client_id,agency_id,service_kind,provider_user_id,label,created_by_user_id,updated_by_user_id) VALUES (?,?,'counseling',?,'Counseling',?,?)",[clientId,agencyId,providerUserId||0,userId,userId]);
 });
 const [[existing]]=await db.execute('SELECT id FROM client_service_enrollments WHERE client_id=? AND agency_id=? AND service_kind=? AND provider_user_id=? LIMIT 1',[clientId,agencyId,serviceKind,providerUserId||0]);
 if(existing)return;
 await db.execute('INSERT IGNORE INTO client_service_enrollments (client_id,agency_id,service_kind,provider_user_id,label) VALUES (?,?,?,?,?)',[clientId,agencyId,serviceKind,providerUserId||0,serviceKind[0].toUpperCase()+serviceKind.slice(1)]);
}
export async function endProviderCounselingService({clientId,agencyId,providerUserId,terminationReason},db=pool){
 const [services]=await db.execute('SELECT * FROM client_service_enrollments WHERE client_id=? AND is_active=1 FOR UPDATE',[clientId]);
 const otherCounselor=services.some(s=>Number(s.agency_id)===Number(agencyId)&&s.service_kind==='counseling'&&Number(s.provider_user_id)>0&&Number(s.provider_user_id)!==Number(providerUserId));
 const ended=services.filter(s=>Number(s.agency_id)===Number(agencyId)&&s.service_kind==='counseling'
  &&(Number(s.provider_user_id)===Number(providerUserId)||(!otherCounselor&&!Number(s.provider_user_id))));
 const closureReason=({lost_contact:'discontinued_contact',goals_achieved:'care_completed',client_choice:'client_choice',transfer:'provider_transition'})[terminationReason]||'other';
 const status=terminationReason==='goals_achieved'?'completed':terminationReason==='lost_contact'?'terminated':'discontinued';
 for(const service of ended)await db.execute("UPDATE client_service_enrollments SET is_active=0,service_status=?,ended_at=UTC_TIMESTAMP(),updated_by_user_id=?,closure_reason=?,client_end_reason=? WHERE id=?",[status,providerUserId,closureReason,SERVICE_CLOSURE_REASONS[closureReason],service.id]);
 const remaining=services.filter(s=>!ended.some(e=>Number(e.id)===Number(s.id)));
 if(remaining.length){
  if(!remaining.some(s=>Number(s.provider_user_id)===Number(providerUserId))){
   await db.execute('UPDATE client_provider_assignments SET is_active=0,is_primary=0,updated_by_user_id=? WHERE client_id=? AND provider_user_id=?',[providerUserId,clientId,providerUserId]);
   await db.execute('UPDATE clients SET provider_id=NULL,service_day=NULL WHERE id=? AND provider_id=?',[clientId,providerUserId]);
  }
  await db.execute("INSERT INTO client_status_history (client_id,changed_by_user_id,field_changed,from_value,to_value,note) VALUES (?,?,'service_enrollment','active','ended',?)",[clientId,providerUserId,'Counseling service ended; other active services remain.']);
 }
 return {remainingActive:clientServiceAssignments(remaining).length};
}

export async function updateClientServiceStatus({clientId,agencyId,serviceId,userId,input},db=pool,{lock=withClientSchedulingLock}={}){
 const status=String(input.status||''),reason=String(input.reason||'').trim();
 const closure=status==='active'?null:String(input.closureReason||({completed:'care_completed',discontinued:'client_choice'}[status]||'other'));
 if(closure&&!Object.hasOwn(SERVICE_CLOSURE_REASONS,closure))throw fail(400,'Choose a reason to display to the client.');
 if(!Object.hasOwn(SERVICE_STATUSES,status)||!reason||reason.length>500||input.confirmed!==true)throw fail(400,'Choose a service status, give a reason (up to 500 characters), and confirm the change.');
 return lock([clientId],async()=>{
  const conn=await db.getConnection();
  try{
   await conn.beginTransaction();
   const [[service]]=await conn.execute('SELECT * FROM client_service_enrollments WHERE id=? AND client_id=? AND agency_id=? FOR UPDATE',[serviceId,clientId,agencyId]);
   if(!service)throw fail(404,'Service enrollment not found.');
   const previous=serviceStatus(service);
   if(input.expectedStatus!==previous)throw fail(409,'The service status changed. Refresh and review it again.');
   const [pending]=await conn.execute("SELECT id FROM guardian_service_cancellations WHERE client_id=? AND agency_id=? AND provider_user_id=? AND service_kind=? AND scope='end_services' AND status IN ('queued','processing') LIMIT 1",[clientId,agencyId,service.provider_user_id,service.service_kind]);
   if(pending.length)throw fail(409,'The service cancellation is still finishing. Review it before changing status.');
   if(status==='active'){
    const [[client]]=await conn.execute('SELECT c.status,s.status_key AS client_status_key FROM clients c LEFT JOIN client_statuses s ON s.id=c.client_status_id WHERE c.id=?',[clientId]);
    if(terminalProfile(client))throw fail(409,'Restore the client’s overall active status before restarting this service.');
   }else{
    const [future]=await conn.execute(`SELECT a.id,a.business_type AS businessType FROM appointments a JOIN appointment_participants p ON p.appointment_id=a.id AND p.client_id=?
      WHERE a.agency_id=? AND a.provider_user_id=? AND a.start_at>UTC_TIMESTAMP() AND a.status IN ('scheduled','confirmed','client_confirmed')`,[clientId,agencyId,service.provider_user_id]);
    if(future.some(a=>appointmentServiceKind(a)===service.service_kind))throw fail(409,'Cancel or transfer the remaining future appointments before ending this service. Review their cancellation policies first.');
   }
   const [same]=await conn.execute('SELECT * FROM client_service_enrollments WHERE client_id=? AND agency_id=? AND provider_user_id=? AND service_kind=? FOR UPDATE',[clientId,agencyId,service.provider_user_id,service.service_kind]);
   const placeholders=[];
   if(status!=='active'&&service.service_kind==='counseling'&&Number(service.provider_user_id)>0){
    const [otherCounselors]=await conn.execute("SELECT id FROM client_service_enrollments WHERE client_id=? AND agency_id=? AND service_kind='counseling' AND is_active=1 AND provider_user_id NOT IN (0,?)",[clientId,agencyId,service.provider_user_id]);
    if(!otherCounselors.length){
     const [unassigned]=await conn.execute("SELECT * FROM client_service_enrollments WHERE client_id=? AND agency_id=? AND service_kind='counseling' AND provider_user_id=0 AND is_active=1 FOR UPDATE",[clientId,agencyId]);
     if(unassigned.length){
      const [future]=await conn.execute(`SELECT a.id,a.provider_user_id AS providerUserId,a.business_type AS businessType FROM appointments a JOIN appointment_participants p ON p.appointment_id=a.id AND p.client_id=?
       WHERE a.agency_id=? AND a.start_at>UTC_TIMESTAMP() AND a.status IN ('scheduled','confirmed','client_confirmed')`,[clientId,agencyId]);
      // Closing a duplicate program row must protect every remaining appointment
      // of that service kind; this is staff validation, not guardian visibility.
      if(future.some(appointment=>appointmentServiceKind(appointment)===service.service_kind))throw fail(409,'Cancel or transfer the remaining future appointments before ending this service. Review their cancellation policies first.');
      placeholders.push(...unassigned);same.push(...unassigned);
     }
    }
   }
   if(status==='active')await conn.execute(`INSERT IGNORE INTO client_service_provider_history (service_enrollment_id,client_id,agency_id,provider_user_id,label,service_status,closure_reason,client_end_reason,recorded_at,ended_at)
    SELECT id,client_id,agency_id,provider_user_id,label,service_status,closure_reason,client_end_reason,created_at,COALESCE(ended_at,updated_at)
    FROM client_service_enrollments WHERE client_id=? AND agency_id=? AND provider_user_id=? AND service_kind=? AND is_active=0`,[clientId,agencyId,service.provider_user_id,service.service_kind]);
   await conn.execute(`UPDATE client_service_enrollments SET service_status=?,is_active=?,ended_at=${status==='active'?'NULL':'COALESCE(ended_at,UTC_TIMESTAMP())'},updated_by_user_id=?,closure_reason=?,client_end_reason=?
    WHERE client_id=? AND agency_id=? AND provider_user_id=? AND service_kind=?`,[status,status==='active'?1:0,userId,closure,closure?SERVICE_CLOSURE_REASONS[closure]:null,clientId,agencyId,service.provider_user_id,service.service_kind]);
   for(const placeholder of placeholders)await conn.execute(`UPDATE client_service_enrollments SET service_status=?,is_active=0,ended_at=COALESCE(ended_at,UTC_TIMESTAMP()),updated_by_user_id=?,closure_reason=?,client_end_reason=?
    WHERE id=? AND client_id=? AND agency_id=? AND provider_user_id=0 AND is_active=1`,[status,userId,closure,SERVICE_CLOSURE_REASONS[closure],placeholder.id,clientId,agencyId]);
   if(status==='active')await conn.execute(`UPDATE client_service_return_requests r JOIN client_service_enrollments e ON e.id=r.service_enrollment_id
    SET r.status='reviewed',r.pending_key=NULL,r.reviewed_by_user_id=?,r.reviewed_at=UTC_TIMESTAMP()
    WHERE e.client_id=? AND e.agency_id=? AND e.provider_user_id=? AND e.service_kind=? AND r.status='pending'`,[userId,clientId,agencyId,service.provider_user_id,service.service_kind]);
   for(const row of same)await conn.execute(`INSERT INTO client_status_history (client_id,changed_by_user_id,field_changed,from_value,to_value,note) VALUES (?,?,?,?,?,?)`,[clientId,userId,`service_status:${row.id}`,serviceStatus(row),status,reason]);
   await conn.commit();return {services:await listClientServices(clientId,agencyId,db)};
  }catch(error){await conn.rollback();throw error;}finally{conn.release();}
 });
}
