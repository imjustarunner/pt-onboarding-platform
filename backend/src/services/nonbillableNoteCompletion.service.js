import crypto from 'node:crypto';
import clinicalPool from '../config/clinicalDatabase.js';
import {maybeDecryptNotePayload,maybeEncryptNotePayload} from './clinicalNoteCrypto.service.js';
const parseObject=value=>typeof value==='string'?JSON.parse(value):value||{};
const policyError=(status,message)=>Object.assign(new Error(message),{status});

export const missedNote = note => {
  const meta=parseObject(note.metadata_json),type=String(note.note_type||meta.noteType||'').toUpperCase();
  return ['MISSED_APPOINTMENT','NO_SHOW'].includes(type)||type==='APPOINTMENT_CHANGE'&&['no_show','cancelled','canceled','did_not_occur','late_cancel'].includes(meta.eventType);
};
export async function completeNonbillableReview({noteId,agencyId,actorUserId,confirmed,expectedHash}, {database=clinicalPool,finishTermination=null,finishMissed=null}={}) {
  if(confirmed!==true)throw policyError(400,'Confirm that you reviewed the note for accuracy and completeness.');
  const db=await database.getConnection();let note;
  try {
    await db.beginTransaction();
    [[note]]=await db.execute('SELECT * FROM clinical_notes WHERE id=? AND agency_id=? FOR UPDATE',[noteId,agencyId]);
    if(!note||note.is_deleted)throw policyError(404,'Note not found');
    if(Number(note.created_by_user_id)!==Number(actorUserId))throw policyError(403,'Only the note author can complete this review.');
    if(note.note_type!=='TERMINATION'&&!missedNote(note))throw policyError(400,'This note does not use this review workflow.');
    const plain=maybeDecryptNotePayload(note.note_payload),hash=crypto.createHash('sha256').update(plain||'').digest('hex');
    if(expectedHash!==hash)throw policyError(409,'The note changed. Read the current content before completing review.');
    const meta=parseObject(note.metadata_json);
    if(note.note_type==='TERMINATION'){const {validateTermination,validateTerminationContent}=await import('./noteAidTermination.service.js');validateTermination(meta.termination);validateTerminationContent(plain);}
    if(!note.provider_signed_at && note.content_review_source!=='provider_review') {
      const review={status:'passed',source:'provider_review',reviewedAt:new Date().toISOString(),reviewedByUserId:actorUserId,contentHash:hash};
      await db.execute("UPDATE clinical_notes SET is_billable=0,content_hash=?,content_review_status='passed',content_review_source='provider_review',content_review_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND agency_id=?",[hash,JSON.stringify(review),noteId,agencyId]);
      note={...note,is_billable:0,content_hash:hash,content_review_status:'passed',content_review_source:'provider_review',content_review_json:review};
    }
    await db.commit();
  } catch(e){await db.rollback();throw e;}finally{db.release();}
  // Completion persists first; retry replays these idempotent side effects.
  if(note.note_type==='TERMINATION'){const complete=finishTermination||(await import('./noteAidTermination.service.js')).recordSignedTermination;await complete(note);}
  else if(finishMissed)await finishMissed(note);
  else {const {onSignedNoteCopay}=await import('./familyLedger/copayAttendance.js');await onSignedNoteCopay({agencyId,noteId,providerUserId:actorUserId});}
  return {ok:true,noteId,reviewed:true,signedAt:note.provider_signed_at||null};
}

/** A single No decision creates one nonbillable chart note, never a signature or fee. */
export async function completeMissedSessionDocumentation({session,providerUserId,noteId=null},database=clinicalPool) {
  const db=await database.getConnection();
  try {
    await db.beginTransaction();
    const [[current]]=await db.execute('SELECT * FROM clinical_sessions WHERE id=? AND agency_id=? FOR UPDATE',[session.id,session.agency_id]);
    if(!current||Number(current.provider_user_id)!==Number(providerUserId))throw policyError(403,'This session is not assigned to you.');
    if(!current.scheduled_end_at||new Date(current.scheduled_end_at)>new Date())throw policyError(409,'Record attendance after the session has ended.');
    const [signed]=await db.execute('SELECT id FROM clinical_notes WHERE clinical_session_id=? AND agency_id=? AND is_billable=1 AND provider_signed_at IS NOT NULL AND is_deleted=0 LIMIT 1',[session.id,session.agency_id]);
    if(signed.length)throw policyError(409,'A completed service note already exists. Review the conflicting attendance before changing it.');
    if(!noteId){
      const [existing]=await db.execute("SELECT id FROM clinical_notes WHERE clinical_session_id=? AND agency_id=? AND is_deleted=0 AND note_type='MISSED_APPOINTMENT' AND JSON_UNQUOTE(JSON_EXTRACT(metadata_json,'$.source'))='provider_attendance' LIMIT 1",[session.id,session.agency_id]);
      noteId=existing[0]?.id;
      if(!noteId){
        const text='The assigned provider confirmed that this scheduled session did not occur. A specific reason was not recorded. No service copay or missed-appointment fee is authorized by this entry.';
        const hash=crypto.createHash('sha256').update(text).digest('hex'),review={status:'passed',source:'provider_review',reviewedAt:new Date().toISOString(),reviewedByUserId:providerUserId,contentHash:hash};
        const [created]=await db.execute("INSERT INTO clinical_notes (clinical_session_id,agency_id,client_id,title,note_payload,metadata_json,created_by_user_id,note_type,is_billable,content_hash,content_review_status,content_review_source,content_review_json) VALUES (?,?,?,'Missed appointment',?,?,?,'MISSED_APPOINTMENT',0,?,'passed','provider_review',?)",[session.id,session.agency_id,current.client_id,maybeEncryptNotePayload(text),JSON.stringify({source:'provider_attendance',noteType:'MISSED_APPOINTMENT',nonBillable:true,documentationFlow:'review',eventType:'did_not_occur'}),providerUserId,hash,JSON.stringify(review)]);
        noteId=created.insertId;
      }
    }
    await db.execute("UPDATE clinical_sessions SET encounter_status=CASE WHEN encounter_status='no_show' THEN 'no_show' ELSE 'cancelled' END,claim_blocked_reason='Session did not occur — nonbillable missed appointment',updated_at=CURRENT_TIMESTAMP WHERE id=? AND agency_id=?",[session.id,session.agency_id]);
    await db.commit();return {noteId};
  }catch(e){await db.rollback();throw e;}finally{db.release();}
}
