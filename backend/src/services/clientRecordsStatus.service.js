import pool from '../config/database.js';

export async function requireRecordsCurrentStatus(agencyId, db = pool) {
  const [rows] = await db.execute(
    "SELECT id,label FROM client_statuses WHERE agency_id=? AND LOWER(status_key)='current' AND is_active=1 LIMIT 1",
    [agencyId]
  );
  if (!rows[0]) throw Object.assign(Error('Configure an active Current client status for this agency before importing records.'), {status:409});
  return {id:Number(rows[0].id),key:'current',label:rows[0].label || 'Current'};
}

// Called inside records completion's transaction, after its source reviews pass.
export async function markRecordsClientCurrent(scope, actorId, db) {
  const [[client]] = await db.execute(
    `SELECT c.status,c.client_status_id,cs.status_key FROM clients c
     LEFT JOIN client_statuses cs ON cs.id=c.client_status_id
     WHERE c.id=? AND c.agency_id=? FOR UPDATE`, [scope.clientId,scope.agencyId]
  );
  if (!client) throw Object.assign(Error('Client not found in this agency.'), {status:404});
  if (['ARCHIVED','TERMINATED'].includes(String(client.status).toUpperCase()) || ['inactive','archived','terminated','dead'].includes(String(client.status_key).toLowerCase())) {
    throw Object.assign(Error('Reopen this client’s status in the profile before completing the records import.'), {status:409});
  }
  const target = await requireRecordsCurrentStatus(scope.agencyId, db);
  const changes = [];
  if (Number(client.client_status_id)!==target.id) changes.push(['client_status_id',client.client_status_id,target.id]);
  if (client.status!=='ACTIVE') changes.push(['status',client.status,'ACTIVE']);
  if (changes.length) {
    await db.execute('UPDATE clients SET client_status_id=?,status=\'ACTIVE\',updated_by_user_id=?,last_activity_at=CURRENT_TIMESTAMP WHERE id=? AND agency_id=?', [target.id,actorId,scope.clientId,scope.agencyId]);
    for (const [field,from,to] of changes) await db.execute(
      'INSERT INTO client_status_history (client_id,changed_by_user_id,field_changed,from_value,to_value,note) VALUES (?,?,?,?,?,?)',
      [scope.clientId,actorId,field,from==null?null:String(from),String(to),'Records import completed; client marked Current']
    );
  }
  return target;
}
