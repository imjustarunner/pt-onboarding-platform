import crypto from 'node:crypto';
import pool from '../config/database.js';
import {maybeEncryptNotePayload,maybeDecryptNotePayload} from './clinicalNoteCrypto.service.js';
import {utcMysqlToIso} from '../utils/zonedWallTime.util.js';
const fail=(message,status=409)=>Object.assign(new Error(message),{status});
export function tutoringFamilyDraft(note) {
 const saved=note?.metadata_json?.familySummaryDraft;
 if(!saved)return null;
 try{return JSON.parse(maybeDecryptNotePayload(saved));}
 catch{throw fail('The saved family summary needs review. Its original text and private learning results have been kept.');}
}
export function tutoringFamilyDraftMetadata(note,input) {
 const summary={};
 for(const field of ['workedOn','howItWent','homePractice']){
  if(typeof input[field]!=='string'||input[field].length>20000)throw fail('Keep each family summary field within 20,000 characters.',400);
  summary[field]=input[field];
 }
 return {...(note?.metadata_json||{}),familySummaryDraft:maybeEncryptNotePayload(JSON.stringify(summary)),shareSkillObservations:input.shareSkillObservations===true,familySummaryGoalIds:input.goalIds||[]};
}
export function tutoringSummaryInput(input={}) {
 const result={};
 for(const field of ['workedOn','howItWent','homePractice']){
  if(typeof input[field]!=='string'||!input[field].trim()||input[field].length>20000)throw fail('Complete Worked on, How it went and Practice at home before sharing. Use “None assigned” when appropriate.',400);
  result[field]=input[field].trim();
 }
 return result;
}
const familyRatingLabels = new Map([
 ['needs_review','Needs more practice'], ['developing','Solved with support'], ['secure','Solved independently']
]);
function familySkillObservations(items) {
 return items.filter(item => item.skill && familyRatingLabels.has(item.rating)).map(item => ({
  skill: item.skill, grade: item.grade || null, observation: familyRatingLabels.get(item.rating)
 }));
}
export async function publishTutoringNote(ctx,session,note,input,db=pool,reviewedItems=[]){
 if(!ctx.host)throw fail('Only the assigned tutor can sign this summary.',403);
 if(input.signatureConfirmed!==true)throw fail('Review this family summary and confirm your own signature.',400);
 const fields=tutoringSummaryInput(input);
 const [[existing]]=await db.execute('SELECT * FROM tutoring_note_publications WHERE note_id=?',[note.id]);
 if(existing){const snapshot=JSON.parse(maybeDecryptNotePayload(existing.snapshot_json));if(Object.entries(fields).some(([key,value]) => snapshot.summary[key] !== value))throw fail('This signed summary is read-only. Its original content has been kept.');return {id:Number(existing.id),signedAt:utcMysqlToIso(existing.signed_at),summary:snapshot.summary};}
 if(['no_show_pending','no_show','late_canceled','canceled','canceled_by_client','canceled_by_provider','canceled_by_guardian','rescheduled','voided'].includes(ctx.appointment.status))throw fail('This appointment has no attended service to share. Review its attendance first.');
 if(!session.actual_started_at||!session.actual_ended_at)throw fail('End the attended session before signing and sharing its summary. Draft notes can be saved beforehand.');
 const snapshot={appointmentId:ctx.appointment.id,clientId:ctx.clientId,agencyId:ctx.appointment.agencyId,sessionId:session.id,subject:ctx.appointment.learningContext?.subjectLabel||'General',startAt:utcMysqlToIso(session.actual_started_at),endAt:utcMysqlToIso(session.actual_ended_at),scheduledStartAt:utcMysqlToIso(ctx.appointment.startAt),scheduledEndAt:utcMysqlToIso(ctx.appointment.endAt),summary:fields,goalIds:note.metadata_json?.familySummaryGoalIds||note.metadata_json?.goalIds||[],studentSubjectId:session.student_subject_id||null,learningPlanId:note.learning_plan_id||null,authorUserId:ctx.req.user.id};
 if (input.shareSkillObservations === true && reviewedItems.length) {
  const observations = familySkillObservations(reviewedItems);
  if (observations.length) snapshot.summary.skillObservations = observations;
 }
 const json=JSON.stringify(snapshot),hash=crypto.createHash('sha256').update(json).digest('hex');
 const [saved]=await db.execute('INSERT INTO tutoring_note_publications(note_id,appointment_id,session_id,agency_id,client_id,author_user_id,snapshot_json,payload_hash) VALUES (?,?,?,?,?,?,?,?)',[note.id,ctx.appointment.id,session.id,ctx.appointment.agencyId,ctx.clientId,ctx.req.user.id,maybeEncryptNotePayload(json),hash]);
 await db.execute("UPDATE tutoring_session_notes SET status='signed',saved_at=COALESCE(saved_at,UTC_TIMESTAMP()),saved_by_user_id=?,updated_by_user_id=? WHERE id=?",[ctx.req.user.id,ctx.req.user.id,note.id]);
 return {id:Number(saved.insertId),summary:snapshot.summary,newPublication:true};
}
export async function listPublishedTutoringSummaries(clientId,{agencyId,providerId=null,serviceId=null}={},db=pool){
 if(!agencyId||providerId===0)return [];
 const [rows]=await db.execute(`SELECT p.*,CONCAT_WS(' ',u.first_name,u.last_name) AS author_name FROM tutoring_note_publications p JOIN appointments a ON a.id=p.appointment_id AND a.agency_id=p.agency_id JOIN users u ON u.id=p.author_user_id WHERE p.client_id=? AND p.agency_id=? ${providerId?'AND a.provider_user_id=?':''} ${serviceId?"AND CAST(JSON_UNQUOTE(JSON_EXTRACT(a.learning_context_json,'$.serviceEnrollmentId')) AS UNSIGNED)=?":''} ORDER BY p.signed_at DESC,p.id DESC LIMIT 20`,[clientId,agencyId,...(providerId?[providerId]:[]),...(serviceId?[serviceId]:[])]);
 return rows.map(row=>{const data=JSON.parse(maybeDecryptNotePayload(row.snapshot_json));return {id:Number(row.id),appointmentId:Number(row.appointment_id),sessionId:Number(row.session_id),signedAt:utcMysqlToIso(row.signed_at),authorName:row.author_name,subjectLabel:data.subject,startAt:data.startAt,endAt:data.endAt,summary:data.summary};});
}

export async function getPublishedTutoringNote(noteId,db=pool){const [[row]]=await db.execute('SELECT id,signed_at,snapshot_json FROM tutoring_note_publications WHERE note_id=?',[noteId]);if(!row)return null;const snapshot=JSON.parse(maybeDecryptNotePayload(row.snapshot_json));return {id:Number(row.id),signedAt:utcMysqlToIso(row.signed_at),...snapshot};}

// Return only the public fields for this authorized appointment and its exact session.
export async function getAppointmentFamilySummary(ctx, session, db=pool) {
 const [rows]=await db.execute(
  `SELECT p.signed_at,p.snapshot_json,CONCAT_WS(' ',u.first_name,u.last_name) AS author_name
     FROM tutoring_note_publications p
     JOIN users u ON u.id=p.author_user_id
    WHERE p.appointment_id=? AND p.session_id=? AND p.agency_id=? AND p.client_id=? LIMIT 1`,
  [ctx.appointment.id,session.id,ctx.appointment.agencyId,ctx.clientId]);
 const row=rows?.[0];
 if(!row)return null;
 const data=JSON.parse(maybeDecryptNotePayload(row.snapshot_json));
 return {summary:data.summary,authorName:row.author_name,signedAt:utcMysqlToIso(row.signed_at)};
}
