import crypto from 'node:crypto';
import clinicalPool from '../config/clinicalDatabase.js';
import {maybeDecryptNotePayload} from './clinicalNoteCrypto.service.js';
import {assertNarrivaRiskBeforeSignature} from './narrivaRiskAssessment.service.js';
import {assertNoPendingClinicalServiceChange} from '../utils/clinicalServiceChangePolicy.js';
const parseObject=value=>typeof value==='string'?JSON.parse(value):value||{};
const policyError=(status,message)=>Object.assign(new Error(message),{status});

export const missedNote = note => {
  const meta=parseObject(note.metadata_json),type=String(note.note_type||meta.noteType||'').toUpperCase();
  return ['MISSED_APPOINTMENT','NO_SHOW'].includes(type)||type==='APPOINTMENT_CHANGE'&&['no_show','cancelled','canceled','did_not_occur','late_cancel'].includes(meta.eventType);
};
export async function completeNonbillableReview({noteId,agencyId,actorUserId,confirmed,expectedHash}, {database=clinicalPool,finishTermination=null,finishMissed=null,riskGate=assertNarrivaRiskBeforeSignature}={}) {
  if(confirmed!==true)throw policyError(400,'Confirm that you reviewed the note for accuracy and completeness.');
  const db=await database.getConnection();let note;
  try {
    await db.beginTransaction();
    const [[reference]]=await db.execute('SELECT clinical_session_id FROM clinical_notes WHERE id=? AND agency_id=?',[noteId,agencyId]);
    if(!reference)throw policyError(404,'Note not found');
    // Follow the standard signer lock order: actual encounter, then note.
    const [[session]]=reference.clinical_session_id?await db.execute('SELECT * FROM clinical_sessions WHERE id=? AND agency_id=? FOR UPDATE',[reference.clinical_session_id,agencyId]):[[null]];
    if(reference.clinical_session_id&&!session)throw policyError(409,'The linked encounter is unavailable. Reload before completing review.');
    assertNoPendingClinicalServiceChange(session);
    [[note]]=await db.execute('SELECT * FROM clinical_notes WHERE id=? AND agency_id=? FOR UPDATE',[noteId,agencyId]);
    if(Number(note?.clinical_session_id||0)!==Number(reference.clinical_session_id||0))throw policyError(409,'The encounter link changed. Reload before completing review.');
    if(!note||note.is_deleted)throw policyError(404,'Note not found');
    if(Number(note.created_by_user_id)!==Number(actorUserId))throw policyError(403,'Only the note author can complete this review.');
    if(note.note_type!=='TERMINATION'&&!missedNote(note))throw policyError(400,'This note does not use this review workflow.');
    const plain=maybeDecryptNotePayload(note.note_payload),hash=crypto.createHash('sha256').update(plain||'').digest('hex');
    if(expectedHash!==hash)throw policyError(409,'The note changed. Read the current content before completing review.');
    await riskGate(note);
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

/** Apply the completed missed/cancellation documentation; never fabricate a chart note. */
export async function completeMissedSessionDocumentation({session,providerUserId,noteId=null},database=clinicalPool,{riskGate=assertNarrivaRiskBeforeSignature}={}) {
  const db=await database.getConnection();
  try {
    await db.beginTransaction();
    const [[current]]=await db.execute('SELECT * FROM clinical_sessions WHERE id=? AND agency_id=? FOR UPDATE',[session.id,session.agency_id]);
    if(!current||Number(current.provider_user_id)!==Number(providerUserId))throw policyError(403,'This session is not assigned to you.');
    assertNoPendingClinicalServiceChange(current);
    if(!current.scheduled_end_at||new Date(current.scheduled_end_at)>new Date())throw policyError(409,'Record attendance after the session has ended.');
    const [signed]=await db.execute('SELECT id FROM clinical_notes WHERE clinical_session_id=? AND agency_id=? AND is_billable=1 AND provider_signed_at IS NOT NULL AND is_deleted=0 LIMIT 1',[session.id,session.agency_id]);
    if(signed.length)throw policyError(409,'A completed service note already exists. Review the conflicting attendance before changing it.');
    if(!noteId)throw policyError(409,'Complete the missed-appointment or cancellation note flow first.');
    const [[note]]=await db.execute('SELECT * FROM clinical_notes WHERE id=? AND agency_id=? AND clinical_session_id=? AND is_deleted=0',[noteId,session.agency_id,session.id]);
    if(!note||!missedNote(note)||(!note.provider_signed_at&&note.content_review_source!=='provider_review'))throw policyError(409,'Complete the missed-appointment or cancellation note review first.');
    await riskGate({...note,agency_id:session.agency_id,clinical_session_id:session.id});
    await db.execute("UPDATE clinical_sessions SET encounter_status=CASE WHEN encounter_status='no_show' THEN 'no_show' ELSE 'cancelled' END,claim_blocked_reason='Session did not occur — nonbillable missed appointment',updated_at=CURRENT_TIMESTAMP WHERE id=? AND agency_id=?",[session.id,session.agency_id]);
    await db.commit();return {noteId};
  }catch(e){await db.rollback();throw e;}finally{db.release();}
}
