import {adjustProviderSlots} from './providerSlots.service.js';

// A timestamp can belong to a previous episode of care. Current catalog status
// determines termination; an old timestamp alone must not close resumed care.
export const hasTerminalClientStatus=client=>['terminated','archived','dead'].includes(String(client?.client_status_key||client?.status_key||'').toLowerCase())
  ||String(client?.client_status_label||'').toLowerCase().includes('terminated');

export function visibleSchoolRosterClients(clients, { includeTerminated = false } = {}) {
  return includeTerminated ? clients : clients.filter(client => !hasTerminalClientStatus(client));
}

/** Called inside the client update transaction. No records or appointments are
 * deleted. Former assignments remain queryable, and failure rolls back closure. */
export async function closeTerminatedClientRoster(db,{clientId,actorUserId=null}) {
  const [[client]]=await db.execute(`SELECT c.id,c.agency_id,c.status,c.provider_id,c.service_day,c.organization_id,c.terminated_at,
    s.status_key AS client_status_key,s.label AS client_status_label FROM clients c
    LEFT JOIN client_statuses s ON s.id=c.client_status_id WHERE c.id=? FOR UPDATE`,[clientId]);
  if(!client||!hasTerminalClientStatus(client))return {changed:false,assignmentsClosed:0};
  const [assignments]=await db.execute(`SELECT id,organization_id,provider_user_id,service_day FROM client_provider_assignments
    WHERE client_id=? AND is_active=TRUE FOR UPDATE`,[clientId]);
  const history=async(field,from,to,note)=>db.execute(`INSERT INTO client_status_history
    (client_id,changed_by_user_id,field_changed,from_value,to_value,note) VALUES (?,?,?,?,?,?)`,
    [clientId,actorUserId,field,from==null?null:String(from),to,note]);
  if(client.status!=='ARCHIVED')await history('status',client.status,'ARCHIVED','Inactive after termination; medical records and historical care remain retained.');
  if(client.provider_id)await history('provider_id',client.provider_id,'unassigned','Active provider assignment ended after termination; prior provider retained in history.');
  for(const a of assignments)await history('provider_assignment',JSON.stringify({id:a.id,organizationId:a.organization_id,providerId:a.provider_user_id,day:a.service_day}),'inactive','Assignment ended after termination; original assignment row retained.');
  await db.execute(`UPDATE clients SET status='ARCHIVED',provider_id=NULL,service_day=NULL,
    updated_by_user_id=COALESCE(?,updated_by_user_id) WHERE id=?`,[actorUserId,clientId]);
  await db.execute(`UPDATE client_provider_assignments SET is_active=FALSE,is_primary=FALSE,
    updated_by_user_id=COALESCE(?,updated_by_user_id),updated_at=CURRENT_TIMESTAMP WHERE client_id=? AND is_active=TRUE`,[actorUserId,clientId]);
  const pairs=new Map([...assignments,{provider_user_id:client.provider_id,organization_id:client.organization_id,service_day:client.service_day}]
    .filter(a=>a.provider_user_id&&a.organization_id&&a.service_day)
    .map(a=>[`${a.provider_user_id}:${a.organization_id}:${a.service_day}`,a]));
  // Recompute from remaining assignments instead of adding a slot twice on retry.
  for(const a of pairs.values())await adjustProviderSlots(db,{providerUserId:a.provider_user_id,schoolId:a.organization_id,dayOfWeek:a.service_day,delta:0,allowNegative:true});
  return {changed:client.status!=='ARCHIVED'||!!client.provider_id||assignments.length>0,assignmentsClosed:assignments.length};
}
