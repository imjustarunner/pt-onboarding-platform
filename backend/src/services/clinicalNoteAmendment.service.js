import { appendReviewRequest, noteAuthorId, markSupervisorQueue, synchronizeSupervisorQueue } from './clinicalSupervisorReview.service.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { parseObject, policyError } from './supervisedBillingPolicy.service.js';
import { normalizeClinicalServiceLines,queueServiceChange } from './claimServiceChanges.service.js';

// Use the same note lock as claim submission and cosign so neither can approve
// an old version while an amendment is being appended.
export async function appendClinicalNoteAmendment({ noteId, agencyId, body, actorUserId, requestSignoff, serviceLines, entryKind, reason, authorAttested, supervisorUserId }, source = clinicalPool) {
  if (!['addendum', 'correction', 'late_entry'].includes(entryKind)) throw policyError(400, 'Choose addendum, amendment/correction, or late entry');
  if (typeof body !== 'string' || !body.trim() || body.length > 20000) throw policyError(400, 'Entry text must contain 1–20,000 characters');
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 2000) throw policyError(400, 'A reason of 1–2,000 characters is required');
  if (authorAttested !== true || !Number.isSafeInteger(Number(actorUserId)) || Number(actorUserId) <= 0) throw policyError(400, 'The entry author must attest and sign this new entry');
  if (serviceLines !== undefined && entryKind !== 'correction') throw policyError(400, 'Service code or unit changes require an amendment/correction');
  const correctedLines=serviceLines===undefined?null:normalizeClinicalServiceLines(serviceLines);
  const db = await source.getConnection();
  let signedNote, queueMarker;
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
    if (!note.provider_signed_at && note.content_review_source !== 'provider_review') throw policyError(409, 'Complete the original note before attaching an amendment');
    const meta = parseObject(note.metadata_json);
    if (meta.supervisorCosign) {
      meta.supervisorCosignHistory = [...(meta.supervisorCosignHistory || []), meta.supervisorCosign];
      delete meta.supervisorCosign;
    }
    const amendmentBody=correctedLines?`${body}\n\nAttested service correction (complete service list):\n${correctedLines.map(l=>`${l.procedureCode}: ${l.units} unit(s)`).join('\n')}\nRequested by user #${actorUserId}. Requires supervisor approval and separate billing review; does not transmit a claim.`:body;
    const [added]=await db.execute(`INSERT INTO clinical_note_addenda (clinical_note_id,agency_id,client_id,body,created_by_user_id,entry_kind,entry_reason,author_signed_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP(6))`,
      [noteId,agencyId,note.client_id,amendmentBody,actorUserId,entryKind,reason.trim()]);
    if (Number(actorUserId) === noteAuthorId(note)) {
      for (const request of meta.reviewRequests || []) if (request.action === 'changes_needed' && !request.resolvedAt) {
        request.resolvedAt = new Date().toISOString(); request.resolvedByUserId = Number(actorUserId); request.resolutionAmendmentId = added.insertId;
      }
    } else if (noteAuthorId(note)) {
      appendReviewRequest(meta, {action:'review_acknowledge',message:`An amendment was added to your signed note. Reason: ${reason.trim()}`,actorUserId,source:'amendment',amendmentId:added.insertId});
    }
    if(correctedLines)await queueServiceChange(db,note,added.insertId,correctedLines,actorUserId);
    if (supervisorUserId) queueMarker=markSupervisorQueue(meta,note,supervisorUserId,'awaiting_supervisor');
    signedNote=note;
    await db.execute(`UPDATE clinical_notes SET supervisor_cosigned_at=NULL,supervisor_cosigned_by_user_id=NULL,metadata_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND agency_id=?`,
      [JSON.stringify(meta),noteId,agencyId]);
    await db.commit();
  } catch (e) { await db.rollback(); throw e; }
  finally { db.release(); }
  if (queueMarker) return {queueSynchronizationPending:!await synchronizeSupervisorQueue(signedNote,queueMarker)};
  if (requestSignoff) await requestSignoff(signedNote);
}
