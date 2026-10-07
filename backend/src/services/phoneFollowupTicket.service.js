import crypto from 'node:crypto';
import pool from '../config/database.js';
import { encryptChatText } from './chatEncryption.service.js';
import { normalizeWorkflowPhone } from './phoneWorkflow.service.js';
export const PHONE_TICKET_TOPICS = ['general','billing'];
export const PHONE_FOLLOWUP_OUTCOMES = ['callback_requested','missed_call','voicemail','follow_up_needed'];
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export function normalizePhoneFollowup(body) {
  if (!body || typeof body !== 'object') fail('Phone follow-up is required.');
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.requestId || '')) fail('A valid follow-up request ID is required.');
  if (!PHONE_TICKET_TOPICS.includes(body.topic)) fail('Choose Billing or General support.');
  if (!PHONE_FOLLOWUP_OUTCOMES.includes(body.outcome)) fail('Choose the reason follow-up is needed.');
  if (typeof body.notes !== 'string' || !body.notes.trim() || body.notes.length>5000) fail('Add a follow-up note of at most 5,000 characters.');
  if (body.callerName != null && (typeof body.callerName !== 'string' || body.callerName.length>120)) fail('Caller name must be at most 120 characters.');
  return {requestId:body.requestId.toLowerCase(),topic:body.topic,outcome:body.outcome,notes:body.notes.trim(),callerName:(body.callerName || '').trim(),callbackPhone:normalizeWorkflowPhone(body.callbackPhone,true)};
}
export async function createPhoneFollowupTicket({agencyId,userId,body},db=pool) {
  const data=normalizePhoneFollowup(body);
  const question=[`Phone follow-up: ${data.outcome.replaceAll('_',' ')}`,data.callerName?`Caller: ${data.callerName}`:'',data.callbackPhone?`Callback: ${data.callbackPhone}`:'',data.notes].filter(Boolean).join('\n');
  // Never put callback numbers, caller names or notes into notifications/subjects.
  const encrypted=encryptChatText(question);
  const digest=crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const conn=await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(`INSERT INTO phone_followup_tickets (agency_id,request_key,request_digest) VALUES (?,?,?)
      ON DUPLICATE KEY UPDATE request_key=VALUES(request_key)`,[agencyId,data.requestId,digest]);
    const [existing]=await conn.execute('SELECT ticket_id,request_digest FROM phone_followup_tickets WHERE agency_id=? AND request_key=? FOR UPDATE',[agencyId,data.requestId]);
    if(existing[0]?.request_digest!==digest)fail(`This request was already saved${existing[0]?.ticket_id?` as ticket #${existing[0].ticket_id}`:''}. Start a new follow-up for different details.`,409);
    if(existing[0]?.ticket_id){await conn.commit();return {ticketId:existing[0].ticket_id,topic:data.topic,duplicate:true};}
    const label=data.topic==='billing'?'Billing':'Support';
    const [ticket]=await conn.execute(`INSERT INTO support_tickets
      (school_organization_id,agency_id,created_by_user_id,subject,question,status,priority,target_scope,topic,source_channel,created_by_source_key,
       question_ciphertext,question_iv,question_auth_tag,question_encryption_key_id)
      VALUES (?,?,?,?,NULL,'open','medium','tenant',?,'phone','phone_followup',?,?,?,?)`,
      [agencyId,agencyId,userId,`${label} phone follow-up`,data.topic,encrypted.ciphertextB64,encrypted.ivB64,encrypted.authTagB64,encrypted.keyId]);
    const ticketId=ticket.insertId;
    await conn.execute('UPDATE phone_followup_tickets SET ticket_id=? WHERE agency_id=? AND request_key=?',[ticketId,agencyId,data.requestId]);
    const [recipients]=await conn.execute(`SELECT DISTINCT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id
      WHERE ua.agency_id=? AND ua.is_active=TRUE AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0
      AND UPPER(COALESCE(u.status,'')) NOT IN ('TERMINATED','TERMINATED_PENDING','ARCHIVED','INACTIVE_EMPLOYEE')
      AND (u.role IN ('admin','super_admin') OR ${data.topic==='billing'?'COALESCE(ua.has_billing_access,0)=1':"u.role IN ('support','clinical_practice_assistant')"})`,[agencyId]);
    // Same transaction: a failed notification write rolls back the whole submission
    // and its retry key. No partially created ticket or duplicate alerts on retry.
    for (const person of recipients) {
      if(Number(person.id)===Number(userId))continue;
      await conn.execute(`INSERT INTO notifications
        (type,severity,title,message,user_id,agency_id,related_entity_type,related_entity_id,actor_user_id,actor_source)
        VALUES ('support_ticket_created','info',?,?,?,?, 'support_ticket',?,?,'phone_followup')`,
        [`${label} phone follow-up`,`Ticket #${ticketId} needs follow-up. Open the ticket to review and claim it.`,person.id,agencyId,ticketId,userId]);
    }
    await conn.commit();
    return {ticketId,topic:data.topic,duplicate:false};
  } catch(e){await conn.rollback();throw e;} finally{conn.release();}
}
