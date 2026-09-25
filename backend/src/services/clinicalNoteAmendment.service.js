import clinicalPool from '../config/clinicalDatabase.js';
import { parseObject, policyError } from './supervisedBillingPolicy.service.js';

// Use the same note lock as claim submission and cosign so neither can approve
// an old version while an amendment is being appended.
export async function appendClinicalNoteAmendment({ noteId, agencyId, body, actorUserId, requestSignoff }, source = clinicalPool) {
  const db = await source.getConnection();
  try {
    await db.beginTransaction();
    const [[note]] = await db.execute('SELECT * FROM clinical_notes WHERE id = ? AND agency_id = ? FOR UPDATE', [noteId, agencyId]);
    if (!note || note.is_deleted) throw policyError(404, 'Note not found');
    if (!note.provider_signed_at) throw policyError(409, 'Sign the original note before attaching an amendment');
    const meta = parseObject(note.metadata_json);
    if (meta.supervisorCosign) {
      meta.supervisorCosignHistory = [...(meta.supervisorCosignHistory || []), meta.supervisorCosign];
      delete meta.supervisorCosign;
    }
    await db.execute(`INSERT INTO clinical_note_addenda (clinical_note_id,agency_id,client_id,body,created_by_user_id) VALUES (?,?,?,?,?)`,
      [noteId,agencyId,note.client_id,body,actorUserId]);
    await db.execute(`UPDATE clinical_notes SET supervisor_cosigned_at=NULL,supervisor_cosigned_by_user_id=NULL,metadata_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND agency_id=?`,
      [JSON.stringify(meta),noteId,agencyId]);
    // Populate the work queue before releasing the lock to a concurrent cosigner.
    if (requestSignoff) await requestSignoff(note);
    await db.commit();
  } catch (e) { await db.rollback(); throw e; }
  finally { db.release(); }
}
