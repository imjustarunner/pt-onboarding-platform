import crypto from 'node:crypto';
import pool from '../config/database.js';
import {isRealInactiveClient} from '../utils/clientInactivePolicy.js';

export const REACTIVATION_TRIGGERS=Object.freeze([
 'event_registration','provider_assignment','form_submission','confirmed_appointment',
 'accepted_referral','staff_reactivation','guardian_return_request','records_import'
]);
const fail=(message,status=409)=>Object.assign(new Error(message),{status});
export function canReactivateClient(client){
 return isRealInactiveClient(client)&&!client.compliance_archived_at;
}

/** Call only after the originating activity has been authorized and saved.
 * Supplying its transaction makes the activity, status and history atomic.
 * Reads, reconciliations, payment receipts and profile edits never call here.
 */
export async function reactivateClientForActivity(input,{db=pool,executor=null}={}){
 const clientId=Number(input.clientId),agencyId=Number(input.agencyId||0),trigger=String(input.trigger||'');
 if(!Number.isSafeInteger(clientId)||clientId<1||!REACTIVATION_TRIGGERS.includes(trigger)||!String(input.sourceId||'').trim())throw fail('A saved reactivation activity is required.',400);
 const actor=input.actorUserId==null?null:Number(input.actorUserId);
 if(actor!==null&&(!Number.isSafeInteger(actor)||actor<1))throw fail('Invalid activity actor.',400);
 const connection=executor||await db.getConnection(),owns=!executor;
 try {
  if(owns)await connection.beginTransaction();
  const [[client]]=await connection.execute(`SELECT c.id,c.agency_id,c.status,c.client_status_id,c.is_demo,c.created_via_dev_fill,c.compliance_archived_at,
   c.termination_reason,c.terminated_at,c.terminated_by_user_id,c.termination_last_provider_id,c.termination_last_provider_name,c.termination_effective_date,c.updated_at,s.status_key AS client_status_key FROM clients c
   LEFT JOIN client_statuses s ON s.id=c.client_status_id WHERE c.id=?${agencyId?' AND (c.agency_id=? OR EXISTS(SELECT 1 FROM client_agency_assignments ca WHERE ca.client_id=c.id AND ca.agency_id=? AND ca.is_active=1))':''} FOR UPDATE`,agencyId?[clientId,agencyId,agencyId]:[clientId]);
  if(!client)throw fail('Client not found.',404);
  if(!canReactivateClient(client) || (trigger==='records_import' && String(client.client_status_key).toLowerCase()!=='inactive')){if(owns)await connection.commit();return {reactivated:false,reason:'not_inactive_or_retained_archive'};}
  const eventKey=crypto.createHash('sha256').update(JSON.stringify([client.agency_id,clientId,trigger,String(input.sourceId)])).digest('hex');
  const marker=`reactivation_event:${eventKey}`;
  const [[prior]]=await connection.execute("SELECT id FROM client_status_history WHERE client_id=? AND field_changed='reactivated' AND note LIKE ? LIMIT 1",[clientId,`%${marker}%`]);
  if(prior){if(owns)await connection.commit();return {reactivated:false,reason:'activity_already_applied'};}
  if(input.occurredAt){
   const toDate=value=>value instanceof Date?value:new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(String(value))?value:String(value).replace(' ','T')+'Z');
   const occurred=toDate(input.occurredAt);
   if(!Number.isFinite(+occurred))throw fail('Invalid activity date.',400);
   const [[closure]]=await connection.execute("SELECT MAX(changed_at) closed_at FROM client_status_history WHERE client_id=? AND field_changed='status' AND to_value='ARCHIVED'",[clientId]);
   const closed=closure?.closed_at||client.terminated_at||client.updated_at;
   if(closed&&+occurred<=+toDate(closed)){if(owns)await connection.commit();return {reactivated:false,reason:'activity_predates_closure'};}
  }
  const [[pending]]=await connection.execute('SELECT id FROM client_schedule_termination_jobs WHERE client_id=? AND completed_at IS NULL LIMIT 1',[clientId]);
  if(pending)throw fail('The previous enrollment closure is still finishing. Please retry shortly.');
  const reviewOnly=trigger==='guardian_return_request';
  const keys=reviewOnly?['prospective','received','packet']:trigger==='records_import'?['current']:['current','received','packet'];
  const [statuses]=await connection.execute(`SELECT id,status_key,label FROM client_statuses WHERE agency_id=? AND is_active=1 AND status_key IN (${keys.map(()=>'?').join(',')})`,[client.agency_id,...keys]);
  const target=keys.map(key=>statuses.find(s=>s.status_key===key)).find(Boolean);
  if(!target)throw fail('Configure an active enrollment status for this agency before reopening this client.');
  const status=reviewOnly?'PENDING_REVIEW':'ACTIVE';
  const previous={status:client.status,clientStatusId:client.client_status_id,terminatedAt:client.terminated_at,terminatedByUserId:client.terminated_by_user_id,
   terminationReason:client.termination_reason,lastProviderId:client.termination_last_provider_id,lastProviderName:client.termination_last_provider_name,effectiveDate:client.termination_effective_date};
  await connection.execute(`UPDATE clients SET status=?,client_status_id=?,terminated_at=NULL,terminated_by_user_id=NULL,
   enrollment_reopened_at=UTC_TIMESTAMP(),enrollment_reopened_source=?,enrollment_followup_id=NULL,updated_by_user_id=?,last_activity_at=UTC_TIMESTAMP()
   WHERE id=? AND agency_id=?`,[status,target.id,trigger,actor,clientId,client.agency_id]);
  const note=`${reviewOnly?'Enrollment reopened for intake review':'Client reactivated'}: ${trigger.replaceAll('_',' ')}. ${marker}. Source: ${String(input.sourceId).slice(0,160)}.${input.reason?' Reason: '+String(input.reason).trim().slice(0,1000)+'.':''} Previous provider assignments, ended services and canceled appointments remain historical.`;
  for(const [field,from,to] of [['status',client.status,status],['client_status_id',client.client_status_id,target.id],['reactivated',JSON.stringify(previous),JSON.stringify({status,clientStatusId:target.id,trigger,sourceId:String(input.sourceId).slice(0,160),reviewOnly})]]){
   await connection.execute('INSERT INTO client_status_history(client_id,changed_by_user_id,field_changed,from_value,to_value,note) VALUES(?,?,?,?,?,?)',[clientId,actor,field,String(from??''),String(to),note]);
  }
  if(owns)await connection.commit();
  return {reactivated:true,clientId,agencyId:client.agency_id,status,clientStatusId:target.id,statusKey:target.status_key,statusLabel:target.label,reviewOnly};
 }catch(error){if(owns)await connection.rollback();throw error;}
 finally{if(owns)connection.release();}
}

/** Only persisted, submitted client bindings authorize a form-triggered return. */
export async function reactivateSubmittedIntakeClients(submissionId,{db=pool,reactivate=reactivateClientForActivity}={}){
 const [rows]=await db.execute(`SELECT DISTINCT c.id,c.agency_id,s.submitted_at FROM intake_submissions s
  JOIN clients c ON c.id=s.client_id OR EXISTS(SELECT 1 FROM intake_submission_clients sc WHERE sc.intake_submission_id=s.id AND sc.client_id=c.id)
  JOIN intake_links l ON l.id=s.intake_link_id
  WHERE s.id=? AND s.status='submitted' AND s.submitted_at IS NOT NULL
   AND (l.organization_id=c.agency_id OR EXISTS(SELECT 1 FROM organization_affiliations a WHERE a.organization_id=l.organization_id AND a.agency_id=c.agency_id AND a.is_active=1)
    OR EXISTS(SELECT 1 FROM programs p WHERE p.id=l.program_id AND p.agency_id=c.agency_id))`,[submissionId]);
 for(const row of rows)await reactivate({clientId:row.id,agencyId:row.agency_id,trigger:'form_submission',sourceId:`intake:${submissionId}`,actorUserId:null,occurredAt:row.submitted_at},{db});
 return {processed:rows.length};
}
