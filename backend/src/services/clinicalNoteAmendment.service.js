import clinicalPool from '../config/clinicalDatabase.js';
import { parseObject, policyError } from './supervisedBillingPolicy.service.js';
import { normalizeClinicalServiceLines,queueServiceChange } from './claimServiceChanges.service.js';

// Use the same note lock as claim submission and cosign so neither can approve
// an old version while an amendment is being appended.
export async function appendClinicalNoteAmendment({ noteId, agencyId, body, actorUserId, requestSignoff, serviceLines }, source = clinicalPool) {
  const correctedLines=serviceLines===undefined?null:normalizeClinicalServiceLines(serviceLines);
  const db = await source.getConnection();
  try {
    await db.beginTransaction();
    if(correctedLines) {
      const [[ref]]=await db.execute('SELECT clinical_session_id FROM clinical_notes WHERE id=? AND agency_id=?',[noteId,agencyId]);
      if(!ref?.clinical_session_id)throw policyError(409,'A service correction needs a linked encounter');
      await db.execute('SELECT id FROM clinical_sessions WHERE id=? AND agency_id=? FOR UPDATE',[ref.clinical_session_id,agencyId]);
      await db.execute('SELECT id FROM clinical_claims WHERE clinical_session_id=? AND agency_id=? ORDER BY id FOR UPDATE',[ref.clinical_session_id,agencyId]);
    }
    const [[note]] = await db.execute('SELECT * FROM clinical_notes WHERE id = ? AND agency_id = ? FOR UPDATE', [noteId, agencyId]);
    if (!note || note.is_deleted) throw policyError(404, 'Note not found');
    if (!note.provider_signed_at) throw policyError(409, 'Sign the original note before attaching an amendment');
    const meta = parseObject(note.metadata_json);
    if (meta.supervisorCosign) {
      meta.supervisorCosignHistory = [...(meta.supervisorCosignHistory || []), meta.supervisorCosign];
      delete meta.supervisorCosign;
    }
    const amendmentBody=correctedLines?`${body}\n\nAttested service correction (complete service list):\n${correctedLines.map(l=>`${l.procedureCode}: ${l.units} unit(s)`).join('\n')}\nRequested by user #${actorUserId}. Requires supervisor approval and separate billing review; does not transmit a claim.`:body;
    const [added]=await db.execute(`INSERT INTO clinical_note_addenda (clinical_note_id,agency_id,client_id,body,created_by_user_id) VALUES (?,?,?,?,?)`,
      [noteId,agencyId,note.client_id,amendmentBody,actorUserId]);
    if(correctedLines)await queueServiceChange(db,note,added.insertId,correctedLines,actorUserId);
    await db.execute(`UPDATE clinical_notes SET supervisor_cosigned_at=NULL,supervisor_cosigned_by_user_id=NULL,metadata_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND agency_id=?`,
      [JSON.stringify(meta),noteId,agencyId]);
    // Populate the work queue before releasing the lock to a concurrent cosigner.
    if (requestSignoff) await requestSignoff(note);
    await db.commit();
  } catch (e) { await db.rollback(); throw e; }
  finally { db.release(); }
}
