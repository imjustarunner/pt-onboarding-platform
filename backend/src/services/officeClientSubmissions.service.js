import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { formsForCheckin, validateCheckinAnswers } from './officeCheckinForms.service.js';
import { encryptChatText, decryptChatText } from './chatEncryption.service.js';
import { checkinSeries } from '../utils/officeCheckinSeries.js';
const fail = (status,message) => Object.assign(new Error(message),{status});
const json = value => typeof value==='string' ? JSON.parse(value) : value;
export function submissionTokenHash(key) {
  if (typeof key!=='string' || !/^[a-f0-9-]{36}$/i.test(key)) throw fail(400,'Please start check-in again.');
  return createHash('sha256').update(key).digest('hex');
}
export async function beginClientSubmission(conn,event,agencyId,key,respondentType,serviceType='counseling') {
  const hash = submissionTokenHash(key);
  if(!['counseling','tutoring'].includes(serviceType))throw fail(400,'Choose therapy or tutoring.');
  if (!['adult_self','youth_self','caregiver'].includes(respondentType)) throw fail(400,'Choose who is answering.');
  const [existing] = await conn.execute('SELECT event_id,provider_id,forms_json,forms_unavailable,completed_at FROM office_client_checkin_submissions WHERE token_hash = ?',[hash]);
  if (existing.length) {
    const row = existing[0];
    if (Number(row.event_id)!==Number(event.id) || Number(row.provider_id)!==Number(event.booked_provider_id) || json(row.forms_json).respondentType !== respondentType || (json(row.forms_json).serviceType||'counseling')!==serviceType) throw fail(409,'Please clear your selection and start again.');
    return {forms:json(row.forms_json).forms,formsUnavailable:!!row.forms_unavailable,completed:!!row.completed_at};
  }
  if (event.client_id) {
    const [[client]] = await conn.execute('SELECT agency_id FROM clients WHERE id = ?',[event.client_id]);
    if (client && Number(client.agency_id)!==agencyId) {
      await assertCheckinClientAccess(conn,event.booked_provider_id,event.client_id,client.agency_id);
      agencyId = Number(client.agency_id);
    }
  }
  const configured = await formsForCheckin(event,agencyId,respondentType,serviceType);
  // A proxy instrument must be explicitly configured as a caregiver version.
  // Generic wording is never silently rewritten and treated as validated.
  const forms = configured.forms.filter(f=>(f.respondentType || 'adult_self')===respondentType);
  const unavailable = configured.unavailable;
  const envelope = {respondentType,serviceType,forms};
  await conn.execute(`INSERT INTO office_client_checkin_submissions (token_hash,office_location_id,event_id,provider_id,agency_id,scheduled_start_at,scheduled_end_at,client_id,clinical_session_id,forms_json,forms_unavailable,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 30 MINUTE))`,[hash,event.office_location_id,event.id,event.booked_provider_id,agencyId,event.start_at,event.end_at,event.client_id || null,event.client_id ? event.clinical_session_id || null : null,JSON.stringify(envelope),unavailable?1:0]);
  return {forms,formsUnavailable:unavailable,completed:false};
}
export function readSubmissionAnswers(value) {
  const stored=json(value);
  if(!stored)return {answers:null,skippedFormIds:[]};
  if(stored.encryptedFeedback)return JSON.parse(decryptChatText(stored.encryptedFeedback));
  return {answers:stored,skippedFormIds:[]};
}
export async function completeClientSubmission({locationId,key,answers,skippedFormIds=[]}) {
  const hash = submissionTokenHash(key);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.execute('SELECT * FROM office_client_checkin_submissions WHERE token_hash = ? AND office_location_id = ? FOR UPDATE',[hash,locationId]);
    if (!row) throw fail(404,'Check-in not found. Please ask your provider for help.');
    if (row.completed_at) {await conn.commit();return {ok:true};}
    if ((row.expires_at instanceof Date ? row.expires_at : new Date(String(row.expires_at).replace(' ','T')+'Z')) < new Date()) throw fail(410,'This form has expired. Please ask your provider for help.');
    const forms=json(row.forms_json).forms;
    if(!Array.isArray(skippedFormIds)||skippedFormIds.some(id=>!forms.some(f=>f.id===id)))throw fail(400,'Please choose a valid questionnaire.');
    const skipped=[...new Set(skippedFormIds)];
    const output = validateCheckinAnswers(forms.filter(f=>!skipped.includes(f.id)),answers);
    let encryptedFeedback;
    try{encryptedFeedback=encryptChatText(JSON.stringify({answers:output,skippedFormIds:skipped}));}catch{throw fail(503,'Secure saving is unavailable. Your arrival is recorded; you can finish without submitting feedback.');}
    await conn.execute('UPDATE office_client_checkin_submissions SET answers_json = ?, completed_at = UTC_TIMESTAMP() WHERE id = ?',[JSON.stringify({encryptedFeedback}),row.id]);
    await conn.commit();return {ok:true};
  } catch(e) {await conn.rollback();throw e;} finally {conn.release();}
}
export async function attachCheckinSeries({providerId,ids,clientId}) {
  if(!Array.isArray(ids)||!ids.length||ids.length>200||ids.some(id=>!Number.isSafeInteger(id)||id<=0)||!Number.isSafeInteger(clientId)||clientId<=0)throw fail(400,'Select visits and a client.');
  const selected=[...new Set(ids)].sort((a,b)=>a-b),conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [rows]=await conn.execute(`SELECT s.*,l.timezone FROM office_client_checkin_submissions s JOIN office_locations l ON l.id=s.office_location_id WHERE s.id IN (${selected.map(()=>'?').join(',')}) AND s.provider_id=? AND EXISTS(SELECT 1 FROM user_agencies ua WHERE ua.user_id=s.provider_id AND ua.agency_id=s.agency_id AND ua.is_active=1) ORDER BY s.id FOR UPDATE`,[...selected,providerId]);
    if(rows.length!==selected.length)throw fail(404,'One or more visits are unavailable. Refresh the list.');
    const group=checkinSeries(rows[0]);
    if(rows.some(row=>checkinSeries(row).key!==group.key))throw fail(400,'Choose visits from the same recurring appointment group.');
    await assertCheckinClientAccess(conn,providerId,clientId,rows[0].agency_id);
    if(rows.some(row=>row.client_id&&Number(row.client_id)!==clientId))throw fail(409,'A selected visit already belongs to another client. Review it individually.');
    for(const row of rows){
      if(Number(row.client_id)===clientId)continue;
      const history=json(row.attachment_history_json)||[];
      history.push({at:new Date().toISOString(),by:providerId,previousClientId:row.client_id,previousSessionId:row.clinical_session_id,clientId,sessionId:null,source:'recurring_checkin_review',series:group.label});
      await conn.execute('UPDATE office_client_checkin_submissions SET client_id=?,attachment_history_json=? WHERE id=?',[clientId,JSON.stringify(history),row.id]);
    }
    await conn.commit();return {ok:true,attachedCount:rows.length};
  }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
export async function assertCheckinClientAccess(db,providerId,clientId,agencyId) {
  const [[client]] = await db.execute(`SELECT c.id,c.agency_id FROM clients c WHERE c.id = ? AND c.agency_id = ? AND EXISTS (SELECT 1 FROM user_agencies ua WHERE ua.user_id = ? AND ua.agency_id = c.agency_id AND ua.is_active = 1) AND (c.provider_id = ? OR EXISTS (SELECT 1 FROM client_provider_assignments a WHERE a.client_id = c.id AND a.provider_user_id = ? AND a.is_active = 1))`,[clientId,agencyId,providerId,providerId,providerId]);
  if (!client) throw fail(403,'Choose a client on your caseload in this agency.');
  return client;
}
export async function privateSubmission(db,id,providerId,lock=false) {
  const [[row]] = await db.execute(`SELECT s.* FROM office_client_checkin_submissions s WHERE s.id = ? AND s.provider_id = ? AND EXISTS (SELECT 1 FROM user_agencies ua WHERE ua.user_id = s.provider_id AND ua.agency_id = s.agency_id AND ua.is_active = 1)${lock?' FOR UPDATE':''}`,[id,providerId]);
  if (!row) throw fail(404,'Check-in submission not found.');return row;
}
export async function attachClientSubmission({id,providerId,clientId,sessionId}) {
  if (!Number.isSafeInteger(clientId) || clientId<=0 || (sessionId!=null && (!Number.isSafeInteger(sessionId) || sessionId<=0))) throw fail(400,'Choose a client and, optionally, a session.');
  const conn=await pool.getConnection();
  try {
    await conn.beginTransaction();
    const row=await privateSubmission(conn,id,providerId,true);
    await assertCheckinClientAccess(conn,providerId,clientId,row.agency_id);
    if(sessionId) {
      const [[session]]=await clinicalPool.execute('SELECT id FROM clinical_sessions WHERE id = ? AND client_id = ? AND agency_id = ? AND provider_user_id = ?',[sessionId,clientId,row.agency_id,providerId]);
      if(!session) throw fail(403,'Choose a session for this client with you in this agency.');
    }
    const history = json(row.attachment_history_json) || [];
    history.push({at:new Date().toISOString(),by:providerId,previousClientId:row.client_id,previousSessionId:row.clinical_session_id,clientId,sessionId});
    await conn.execute('UPDATE office_client_checkin_submissions SET client_id = ?, clinical_session_id = ?, attachment_history_json = ? WHERE id = ?',[clientId,sessionId || null,JSON.stringify(history),id]);
    await conn.commit();return {ok:true};
  } catch(e) {await conn.rollback();throw e;} finally {conn.release();}
}
