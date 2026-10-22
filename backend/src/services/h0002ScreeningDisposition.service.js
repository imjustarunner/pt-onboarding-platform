import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { screeningReviewContext } from './h0002ScreeningWorkflow.service.js';

const fail = message => Object.assign(new Error(message), { status: 409 });
// Resolve a mistakenly generated ROI task without a clinical signature or claim.
// Keep its source, draft and actor/time disposition for the audit trail.
export async function closeRoiScreening({ sessionId, user, sourceHash }) {
  const db = await clinicalPool.getConnection();
  const key = `h0002:sign:${Number(sessionId)}`;
  let acquired = false;
  try {
    const [[lock]] = await db.execute('SELECT GET_LOCK(?, 5) AS acquired', [key]);
    acquired = Number(lock.acquired) === 1;
    if (!acquired) throw fail('The screening is being updated. Please retry.');
    const { note, source } = await screeningReviewContext({ sessionId, user });
    if (!source.roiOnly || sourceHash !== source.sourceHash) throw fail('Reopen the source. Only an ROI-only submission can be closed this way.');
    if (note.provider_signed_at) throw fail('A signed screening cannot be closed as an ROI.');
    const [[main]] = await pool.execute('SELECT DATABASE() AS schemaName, @@server_uuid AS serverId');
    const [[clinical]] = await db.execute('SELECT @@server_uuid AS serverId');
    if (main.serverId !== clinical.serverId || !/^[a-zA-Z0-9_]+$/.test(main.schemaName)) throw fail('Atomic task closure is unavailable on this database configuration.');
    const app = `\`${main.schemaName}\``;
    await db.beginTransaction();
    const [[locked]] = await db.execute('SELECT provider_signed_at,created_by_user_id FROM clinical_notes WHERE id=? FOR UPDATE', [note.id]);
    if (!locked || locked.provider_signed_at || Number(locked.created_by_user_id) !== Number(user.id)) throw fail('This screening changed. Reopen it.');
    const [claims] = await db.execute('SELECT id FROM clinical_claims WHERE clinical_session_id=? LIMIT 1', [sessionId]);
    if (claims.length) throw fail('This record has a claim and requires billing review.');
    const disposition = JSON.stringify({ reason: 'roi_only', actorUserId: Number(user.id), at: new Date().toISOString(), sourceHash });
    const [task] = await db.execute(`UPDATE ${app}.tasks SET status='completed',completed_at=COALESCE(completed_at,NOW()),
      metadata=JSON_SET(COALESCE(metadata,JSON_OBJECT()),'$.screeningDisposition',CAST(? AS JSON)) WHERE id=? AND assigned_to_user_id=?`, [disposition, source.task.id, user.id]);
    if (!task.affectedRows) throw fail('Screening assignment changed.');
    await db.execute(`UPDATE clinical_notes SET is_billable=0,metadata_json=JSON_SET(COALESCE(metadata_json,JSON_OBJECT()),'$.screeningDisposition',CAST(? AS JSON)) WHERE id=?`, [disposition, note.id]);
    await db.execute(`UPDATE clinical_sessions SET encounter_status='cancelled',metadata_json=JSON_SET(COALESCE(metadata_json,JSON_OBJECT()),'$.screeningDisposition',CAST(? AS JSON),'$.plannedClaim',false,'$.reviewPending',false) WHERE id=?`, [disposition, sessionId]);
    await db.execute(`UPDATE ${app}.note_aid_work_queue_items SET status='completed',completed_at=COALESCE(completed_at,NOW()) WHERE user_id=? AND client_key=?`, [user.id, `h0002_task_${source.task.id}`]);
    await db.commit();
    return { ok: true, disposition: 'roi_only', noteId: note.id };
  } catch (error) { await db.rollback(); throw error; }
  finally { try { if (acquired) await db.execute('SELECT RELEASE_LOCK(?)', [key]); } finally { db.release(); } }
}
