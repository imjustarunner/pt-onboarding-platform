import {isLearningAppointment} from '../utils/appointmentPresentation.js';
import {hasLearningAttendanceEvidence} from '../utils/learningScheduleGuard.js';
import pool from '../config/database.js';
import Appointment from '../models/Appointment.model.js';
import {noShowReviewTiming} from '../utils/noShowReviewTiming.js';
import {maybeEncryptNotePayload,maybeDecryptNotePayload} from './clinicalNoteCrypto.service.js';
import {qaAuditMetadataJson} from '../utils/qaAutomationAttribution.js';
import {parseUtcDate} from '../utils/officeEventDateTime.util.js';
import {assertClinicalWorkActive,attachClinicalWorkArchives} from './clinicalWorkArchiveRead.service.js';

const sql=value=>new Date(value).toISOString().slice(0,23).replace('T',' ');
const fail=(message,status=409,code='NO_SHOW_REVIEW_REQUIRED')=>Object.assign(new Error(message),{status,code});
const decode=value=>JSON.parse(maybeDecryptNotePayload(typeof value==='string'?value:JSON.stringify(value)));
const present=row=>row?{id:Number(row.id),appointmentId:Number(row.appointment_id),state:row.state,declaredAt:parseUtcDate(row.declared_at)?.toISOString(),undoUntil:parseUtcDate(row.notify_at)?.toISOString(),notifyAt:parseUtcDate(row.notify_at)?.toISOString(),canUndo:row.state==='pending'&&+new Date()<+parseUtcDate(row.notify_at),correctionWindowClosed:+new Date()>=+parseUtcDate(row.notify_at),undoneAt:parseUtcDate(row.undone_at)?.toISOString()||null}:null;
async function event(db,row,action,actorId=null,metadata={}) {
  await db.execute('INSERT INTO appointment_no_show_review_events(review_id,appointment_id,agency_id,actor_user_id,actor_type,action,metadata_json) VALUES (?,?,?,?,?,?,?)',[row.id,row.appointment_id,row.agency_id,actorId,actorId?'user':'system',action,qaAuditMetadataJson(metadata,actorId)||'{}']);
}
async function locked(appointmentId,work) {
  const db=await pool.getConnection();let held=false;
  try{const [[lock]]=await db.execute('SELECT GET_LOCK(?,10) acquired',[`appointment_change:${Number(appointmentId)}`]);held=Number(lock?.acquired)===1;if(!held)throw fail('This attendance record is being updated. Please retry.');return await work(db);}
  finally{if(held)await db.execute('SELECT RELEASE_LOCK(?)',[`appointment_change:${Number(appointmentId)}`]);db.release();}
}
export async function getAppointmentNoShowReview(appointmentId,db=pool) {
  const [[row]]=await db.execute('SELECT * FROM appointment_no_show_reviews WHERE appointment_id=? ORDER BY id DESC LIMIT 1',[Number(appointmentId)]);
  return present(row);
}
export async function listAppointmentNoShowHistory(appointmentId,db=pool) {
  const [rows]=await db.execute('SELECT id,review_id,action,actor_user_id,created_at,metadata_json FROM appointment_no_show_review_events WHERE appointment_id=? ORDER BY id DESC LIMIT 50',[Number(appointmentId)]);
  return rows.map(row=>{const metadata=typeof row.metadata_json==='string'?JSON.parse(row.metadata_json):row.metadata_json||{};return {id:Number(row.id),reviewId:Number(row.review_id),action:row.action,actorId:row.actor_user_id,at:parseUtcDate(row.created_at)?.toISOString(),reason:metadata.reason||null};});
}

// Called inside the existing signed-workflow appointment lock. The declaration
// changes attendance status, but retains the office, reservation and all money
// until the correction window ends. It is never an attendance completion.
export async function declareAppointmentNoShow(appointment,facts,preview,actorUserId) {
  const timing=noShowReviewTiming(appointment,new Date(),preview.evaluation||{});
  if(!timing.started)throw fail('This appointment has not started.',400);
  if(timing.earlyConfirmationRequired&&facts.earlyNoShowConfirmed!==true)throw fail(`It is suggested that you allow at least ${timing.suggestedWaitMinutes} minutes for the client to arrive. Are you sure you want to record a no-show?`,409,'EARLY_NO_SHOW_CONFIRMATION_REQUIRED');
  const db=await pool.getConnection();
  try {
    await db.beginTransaction();
    await assertClinicalWorkActive({id:appointment.id,archiveResourceType:'appointment'},{db,currentRead:true});
    const [[current]]=await db.execute('SELECT status,start_at,end_at,provider_user_id,agency_id FROM appointments WHERE id=? FOR UPDATE',[appointment.id]);
    if(!current||Number(current.agency_id)!==Number(appointment.agencyId)||Number(current.provider_user_id)!==Number(appointment.providerUserId))throw fail('This appointment changed. Review its current attendance.');
    if(isLearningAppointment(appointment)&&await hasLearningAttendanceEvidence(db,appointment.id))throw fail('This tutoring session has recorded attendance or a signed summary. Open its Session Hub; it cannot be marked as a no-show.',409,'ATTENDED_SESSION_LOCKED');
    const [[existing]]=await db.execute('SELECT * FROM appointment_no_show_reviews WHERE appointment_id=? ORDER BY id DESC LIMIT 1',[appointment.id]);
    if(existing&&existing.state!=='undone'){await db.commit();return present(existing);}
    if(!['draft','scheduled','confirmed','client_confirmed','checked_in'].includes(current.status))throw fail('Review the current attendance before recording a no-show. An attended or completed session is not a no-show.');
    if(+parseUtcDate(current.start_at)!==+parseUtcDate(appointment.startAt)||+parseUtcDate(current.end_at)!==+parseUtcDate(appointment.endAt))throw fail('This appointment moved. Review its current schedule.');
    const now=new Date(),snapshot={facts:{...facts,noShowReviewFinalized:false},preview,appointment:{id:appointment.id,agencyId:appointment.agencyId,providerUserId:appointment.providerUserId,startAt:appointment.startAt,endAt:appointment.endAt}};
    const [saved]=await db.execute('INSERT INTO appointment_no_show_reviews(appointment_id,agency_id,provider_user_id,declared_by_user_id,declared_at,notify_at,previous_status,snapshot_json) VALUES (?,?,?,?,?,?,?,?)',[appointment.id,appointment.agencyId,appointment.providerUserId,actorUserId,sql(now),sql(timing.notifyAt),current.status,maybeEncryptNotePayload(JSON.stringify(snapshot))]);
    await db.execute("UPDATE appointments SET status='no_show_pending',updated_by_user_id=? WHERE id=?",[actorUserId,appointment.id]);
    const row={id:saved.insertId,appointment_id:appointment.id,agency_id:appointment.agencyId,state:'pending',declared_at:now,notify_at:timing.notifyAt};
    await event(db,row,'no_show_declared',actorUserId,{earlyConfirmation:facts.earlyNoShowConfirmed===true,notifyAt:timing.notifyAt,financialOutcome:'deferred'});
    await db.commit();return present(row);
  }catch(error){await db.rollback();throw error;}finally{db.release();}
}

// The caller must recheck the authenticated user's ordinary appointment-change
// authority. Undo is a separate append-only correction, never a signature edit.
export async function undoAppointmentNoShow(appointmentId,actorUserId,reason) {
  const explanation=String(reason||'').trim();
  if(!explanation||explanation.length>2000)throw fail('Enter a short reason for undoing this no-show.',400,'UNDO_REASON_REQUIRED');
  return locked(appointmentId,async db=>{
    await db.beginTransaction();
    try {
      await assertClinicalWorkActive({id:appointmentId,archiveResourceType:'appointment'},{db,currentRead:true});
      const [[appointment]]=await db.execute('SELECT id,status FROM appointments WHERE id=? FOR UPDATE',[appointmentId]);
      const [[row]]=await db.execute('SELECT * FROM appointment_no_show_reviews WHERE appointment_id=? ORDER BY id DESC LIMIT 1 FOR UPDATE',[appointmentId]);
      if(!row)throw fail('There is no pending no-show to undo.');
      if(row.state==='undone'){await db.commit();return {review:present(row),alreadyUndone:true};}
      if(row.state!=='pending'||+new Date()>=+parseUtcDate(row.notify_at))throw fail('The undo window has ended. Ask Support to review an attendance correction.');
      if(appointment?.status!=='no_show_pending')throw fail('This appointment changed. Ask Support to review the pending attendance record.');
      await db.execute('UPDATE appointments SET status=?,updated_by_user_id=? WHERE id=?',[row.previous_status,actorUserId,appointmentId]);
      await db.execute("UPDATE appointment_no_show_reviews SET state='undone',undone_by_user_id=?,undone_at=UTC_TIMESTAMP(3) WHERE id=?",[actorUserId,row.id]);
      await event(db,row,'no_show_undone',actorUserId,{reason:explanation,signedDeclarationPreserved:true,financialOutcome:'not_applied',notification:'suppressed'});
      await db.commit();return {review:{...present(row),state:'undone',canUndo:false,undoneAt:new Date().toISOString()},appointmentId:Number(appointmentId),status:row.previous_status};
    }catch(error){await db.rollback();throw error;}
  });
}

export async function processDueAppointmentNoShows({agencyId=null,appointmentId=null,limit=20}={}) {
  const boundedLimit=Math.min(100,Math.max(1,Math.floor(Number(limit)||20)));
  const [due]=await pool.execute(`SELECT appointment_id FROM appointment_no_show_reviews WHERE state IN ('pending','finalizing') AND notify_at<=UTC_TIMESTAMP(3) ${agencyId?'AND agency_id=?':''} ${appointmentId?'AND appointment_id=?':''} ORDER BY notify_at,id LIMIT ${boundedLimit}`,[...(agencyId?[Number(agencyId)]:[]),...(appointmentId?[Number(appointmentId)]:[])]);
  const results=[];
  for(const item of due) {
    results.push(await locked(item.appointment_id,async db=>{
      const [[row]]=await db.execute('SELECT * FROM appointment_no_show_reviews WHERE appointment_id=? ORDER BY id DESC LIMIT 1',[item.appointment_id]);
      if(!row||!['pending','finalizing'].includes(row.state)||+parseUtcDate(row.notify_at)>Date.now())return {appointmentId:item.appointment_id,skipped:true};
      const snapshot=decode(row.snapshot_json),current=await Appointment.findById(row.appointment_id);
      const [archive]=await attachClinicalWorkArchives([{id:row.appointment_id,archiveResourceType:'appointment'}],{db});
      const matches=current&&Number(current.agencyId)===Number(row.agency_id)&&Number(current.providerUserId)===Number(row.provider_user_id)&&+parseUtcDate(current.startAt)===+parseUtcDate(snapshot.appointment.startAt)&&+parseUtcDate(current.endAt)===+parseUtcDate(snapshot.appointment.endAt)&&['no_show_pending','no_show'].includes(current.status);
      const attended=current&&isLearningAppointment(current)&&await hasLearningAttendanceEvidence(db,current.id);
      if(!matches||attended||archive.administrativeArchive){await db.execute("UPDATE appointment_no_show_reviews SET state='review' WHERE id=?",[row.id]);await event(db,row,'no_show_finalization_needs_review',null,{reason:archive.administrativeArchive?'This appointment is archived; no consequence or notice was applied.':'The appointment or attendance changed; no new consequence or notice was applied.'});return {appointmentId:row.appointment_id,reviewRequired:true};}
      await db.execute("UPDATE appointment_no_show_reviews SET state='finalizing' WHERE id=?",[row.id]);
      const {finalizeAppointmentNoShow}=await import('./appointmentChange.service.js');
      const result=await finalizeAppointmentNoShow(current,snapshot,row);
      await db.execute("UPDATE appointment_no_show_reviews SET state='finalized',result_json=? WHERE id=?",[maybeEncryptNotePayload(JSON.stringify(result)),row.id]);
      await event(db,row,'no_show_finalized',null,{requestedByUserId:row.declared_by_user_id,notificationDueAt:parseUtcDate(row.notify_at).toISOString(),originalSignaturePreserved:true});
      return {appointmentId:row.appointment_id,finalized:true};
    }).catch(error=>({appointmentId:item.appointment_id,reviewRequired:true,error: String(error.message).slice(0,250)})));
  }
  return results;
}
