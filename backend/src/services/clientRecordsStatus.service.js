import pool from '../config/database.js';
import { reactivateClientForActivity } from './clientReactivation.service.js';

export async function requireRecordsCurrentStatus(agencyId, db = pool) {
  const [rows] = await db.execute(
    "SELECT id,label FROM client_statuses WHERE agency_id=? AND LOWER(status_key)='current' AND is_active=1 LIMIT 1",
    [agencyId]
  );
  if (!rows[0]) throw Object.assign(Error('Configure an active Current client status for this agency before importing records.'), {status:409});
  return {id:Number(rows[0].id),key:'current',label:rows[0].label || 'Current'};
}

const closed = message => Object.assign(Error(message), {status:409});
const activeKeys = new Set(['current','being_seen']);

async function readChartStatus(scope, db, lock = false) {
  const [[client]] = await db.execute(
    `SELECT c.status,c.client_status_id,c.compliance_archived_at,cs.status_key,cs.label,cs.is_active AS catalog_active
     FROM clients c LEFT JOIN client_statuses cs ON cs.id=c.client_status_id AND cs.agency_id=c.agency_id
     WHERE c.id=? AND c.agency_id=?${lock ? ' FOR UPDATE' : ''}`, [scope.clientId,scope.agencyId]
  );
  if (!client) throw Object.assign(Error('Client not found in this agency.'), {status:404});
  return client;
}

export async function readRecordsClientStatus(scope, db) {
  const client = await readChartStatus(scope, db);
  const key = String(client.status_key || '').toLowerCase();
  return client.status === 'ACTIVE' && !client.compliance_archived_at && Number(client.catalog_active) === 1 && activeKeys.has(key)
    ? {id:Number(client.client_status_id), key, label:client.label || (key === 'being_seen' ? 'Being Seen' : 'Current')}
    : null;
}

// Records completion owns this transaction and has already validated the imported sections.
export async function markRecordsClientCurrent(scope, actorId, db, {importRevision, reactivate = reactivateClientForActivity} = {}) {
  const client = await readChartStatus(scope, db, true);
  const key = String(client.status_key || '').toLowerCase();
  const workflow = String(client.status || '').toUpperCase();
  if (client.compliance_archived_at || workflow === 'TERMINATED' || ['archived','terminated','dead','deceased'].includes(key)) {
    throw closed('This chart has a closed enrollment or is in retention. Review its status in the client profile before completing the import.');
  }
  if (key === 'inactive') {
    if (!Number.isSafeInteger(importRevision) || importRevision < 1) throw closed('Finish the saved records import to reactivate this client.');
    const result = await reactivate({
      ...scope, actorUserId:actorId, trigger:'records_import', sourceId:`records-import:${importRevision}`
    }, {executor:db});
    if (!result.reactivated) throw closed('This inactive chart needs a status review before it can be activated.');
    return {id:Number(result.clientStatusId), key:result.statusKey, label:result.statusLabel || 'Current'};
  }
  if (workflow === 'ARCHIVED') {
    throw closed('This chart is archived. Review its enrollment in the client profile before completing the import.');
  }
  const target = key === 'being_seen' && Number(client.catalog_active) === 1
    ? {id:Number(client.client_status_id), key, label:client.label || 'Being Seen'}
    : await requireRecordsCurrentStatus(scope.agencyId, db);
  const changes = [];
  if (Number(client.client_status_id)!==target.id) changes.push(['client_status_id',client.client_status_id,target.id]);
  if (workflow!=='ACTIVE') changes.push(['status',client.status,'ACTIVE']);
  if (changes.length) {
    await db.execute("UPDATE clients SET client_status_id=?,status='ACTIVE',updated_by_user_id=?,last_activity_at=CURRENT_TIMESTAMP WHERE id=? AND agency_id=?", [target.id,actorId,scope.clientId,scope.agencyId]);
    for (const [field,from,to] of changes) await db.execute(
      'INSERT INTO client_status_history (client_id,changed_by_user_id,field_changed,from_value,to_value,note) VALUES (?,?,?,?,?,?)',
      [scope.clientId,actorId,field,from==null?null:String(from),String(to),'Records import completed; client enrollment active']
    );
  }
  return target;
}
