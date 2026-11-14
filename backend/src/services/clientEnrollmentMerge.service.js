import pool from '../config/database.js';
import User from '../models/User.model.js';

const fail = (message, status = 409) => Object.assign(new Error(message), { status });
export async function authorizeClientMerge(user, keepId, sourceIds, deps = { db: pool, users: User }) {
  if (!['admin', 'super_admin', 'support'].includes(user?.role)) throw fail('Client merge access required.', 403);
  const ids = [...new Set([keepId, ...sourceIds].map(Number))];
  if (ids.length < 2 || ids.length > 20 || ids.some(id => !Number.isSafeInteger(id) || id < 1)) throw fail('Select 2–20 valid client records.', 400);
  const [rows] = await deps.db.execute(`SELECT id, agency_id FROM clients WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  const agencyId = Number(rows[0]?.agency_id);
  if (rows.length !== ids.length || !agencyId || rows.some(row => Number(row.agency_id) !== agencyId)) throw fail('Every record must belong to the same agency.', 403);
  if (user.role !== 'super_admin' && !(await deps.users.getAgencies(user.id)).some(a => Number(a.id) === agencyId)) throw fail('These clients are outside your agency.', 403);
  return agencyId;
}

const permissions = value => {
  const result = typeof value === 'string' ? JSON.parse(value) : { ...(value || {}) };
  // Provenance differs across repeated enrollments; it is not an access grant.
  for (const key of ['intakeLink', 'coGuardianInviteId', 'sourceInviteId']) delete result[key];
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
};
export function assertCompatibleGuardianLinks(target, source) {
  if (Number(target.access_enabled) !== Number(source.access_enabled)
    || (target.relationship_type || 'guardian') !== (source.relationship_type || 'guardian')
    || JSON.stringify(permissions(target.permissions_json)) !== JSON.stringify(permissions(source.permissions_json))) {
    throw fail('Guardian access differs between these records. Have the care team resolve those permissions before merging.');
  }
}

// Called inside the merge transaction. No signed files or signer ownership are
// rewritten, and no conflicting guardian relationship is silently discarded.
export async function moveEnrollmentRecords(db, keepId, sourceId, {guardianAccessResolution=null,actorUserId=null}={}) {
  const [links] = await db.execute('SELECT * FROM client_guardians WHERE client_id IN (?, ?) FOR UPDATE', [keepId, sourceId]);
  const target = links.filter(row => Number(row.client_id) === Number(keepId));
  const source = links.filter(row => Number(row.client_id) === Number(sourceId));
  const guardians = new Set(links.filter(row => Number(row.access_enabled) === 1 && row.relationship_type !== 'self').map(row => Number(row.guardian_user_id)));
  if (guardians.size > 2) throw fail('The merged record would have more than two active guardians. Review access first.');
  for (const row of source) {
    const existing = target.find(t => Number(t.guardian_user_id) === Number(row.guardian_user_id));
    if (existing) {
      try {assertCompatibleGuardianLinks(existing,row);}
      catch(error){
        if(guardianAccessResolution!=='keep_current' || (existing.relationship_type || 'guardian')!==(row.relationship_type || 'guardian'))throw error;
        // An explicit review may retain the current chart's exact permissions.
        // Never combine grants or enable a pending/revoked current relationship.
        await db.execute(`INSERT INTO client_status_history (client_id,changed_by_user_id,field_changed,from_value,to_value,note)
          VALUES (?,?,'guardian_link_merge',?,? ,?)`,[keepId,actorUserId,String(sourceId),String(keepId),JSON.stringify({guardianUserId:Number(row.guardian_user_id),resolution:'keep_current',priorProgramAccessEnabled:Number(row.access_enabled)===1,priorProgramPermissions:row.permissions_json,currentAccessEnabled:Number(existing.access_enabled)===1})]);
      }
      await db.execute('DELETE FROM client_guardians WHERE client_id = ? AND guardian_user_id = ?', [sourceId, row.guardian_user_id]);
    } else {
      await db.execute('UPDATE client_guardians SET client_id = ? WHERE client_id = ? AND guardian_user_id = ?', [keepId, sourceId, row.guardian_user_id]);
    }
  }
  const [contacts]=await db.execute('SELECT * FROM client_contact_affiliations WHERE client_id IN (?,?) FOR UPDATE',[keepId,sourceId]);
  for(const row of contacts.filter(contact=>Number(contact.client_id)===Number(sourceId))){
    const existing=contacts.find(contact=>Number(contact.client_id)===Number(keepId) && Number(contact.agency_contact_id)===Number(row.agency_contact_id));
    if(existing){
      if(Number(existing.created_by_user_id)!==Number(row.created_by_user_id) || Number(existing.email_reminders_enabled)!==Number(row.email_reminders_enabled) || Number(existing.sms_reminders_enabled)!==Number(row.sms_reminders_enabled))throw fail('An additional contact has different ownership or reminder permissions. Review that contact before merging.');
      // Retain the original affiliation as history; the current record already has it.
      await db.execute('UPDATE client_contact_affiliations SET is_active=0,email_reminders_enabled=0,sms_reminders_enabled=0 WHERE id=?',[row.id]);
    }else await db.execute('UPDATE client_contact_affiliations SET client_id=? WHERE id=?',[keepId,row.id]);
  }
  await db.execute('UPDATE agency_contacts SET client_id=? WHERE client_id=?',[keepId,sourceId]);
  for (const table of ['intake_submissions', 'intake_submission_clients', 'intake_submission_documents', 'client_phi_documents']) {
    await db.execute(`UPDATE ${table} SET client_id = ? WHERE client_id = ?`, [keepId, sourceId]);
  }
  // Invite membership is a set; a two-record duplicate can be in one invite.
  await db.execute('INSERT IGNORE INTO co_guardian_invite_clients (invite_id, client_id) SELECT invite_id, ? FROM co_guardian_invite_clients WHERE client_id = ?', [keepId, sourceId]);
  await db.execute('DELETE FROM co_guardian_invite_clients WHERE client_id = ?', [sourceId]);
  // Preserve the latest encrypted contact snapshot if the surviving record has
  // none. The original snapshot stays on an archived source when both exist;
  // each signed submission remains available separately above.
  await db.execute(`UPDATE client_guardian_intake_profiles p LEFT JOIN client_guardian_intake_profiles k ON k.client_id = ?
    SET p.client_id = ? WHERE p.client_id = ? AND k.id IS NULL`, [keepId, keepId, sourceId]);
}
