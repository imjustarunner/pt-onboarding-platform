import crypto from 'node:crypto';
import pool from '../config/database.js';
import { evidenceRequestContext } from '../utils/evidenceRequestContext.js';
import { networkEvidence, safeRequestPath, sessionReference, resourceEvidence } from '../utils/securityEvidence.js';
import { appendSecurityEvidence, mirrorSecurityEvidence } from './securityEvidence.service.js';

export const PROTECTION_POLICY = Object.freeze({ fileWindowMinutes: 15, filesPerWindow: 5, filesPerDay: 25, emailPerMessage: 50, emailPerWindow: 50, emailPerDay: 200, approvalMaxUnits: 20, approvalMinutes: 60 });
export const resourceReference = value => crypto.createHash('sha256').update(String(value)).digest('hex');
export function protectionError(message, code='ACTIVITY_REVIEW_REQUIRED') { return Object.assign(new Error(message), { status:403,statusCode:403,code }); }
export function protectionActor(req) {
  const id=Number(req?.user?.switchedFromUserId || req?.user?.id || req?.evidenceIdentity?.userId);
  return Number.isSafeInteger(id) && id>0 ? id : null;
}
export function protectionEvent(req, action, outcome, details={}) {
  return { ...(req?.evidenceContext || {requestId:crypto.randomUUID(),method:req?.method || 'JOB',route:safeRequestPath(req?.originalUrl || '/background-email'),...networkEvidence(req || {})}),
    userId:protectionActor(req),email:req?.user?.email || req?.evidenceIdentity?.email || null,role:req?.user?.role || req?.evidenceIdentity?.role || null,
    sessionRef:sessionReference(req?.user?.sessionId || req?.evidenceIdentity?.sessionId),phase:'security_control',action,outcome,details:{...resourceEvidence(req || {}),...details} };
}
export async function recordProtectionAlert(db, req, {kind,reason,units}) {
  const e=protectionEvent(req,'activity_blocked','denied',{kind,reason,units});
  const id=crypto.randomUUID();
  await db.execute(`INSERT INTO activity_protection_alerts (id,user_id,kind,reason,request_id,session_ref,client_ip,ip_source,route,units,occurred_at) VALUES (?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(3))`,[id,e.userId,kind,reason,e.requestId,e.sessionRef,e.clientIp,e.ipSource,e.route,units]);
  const eventId=await appendSecurityEvidence({...e,details:{...e.details,alertId:id}},db,{mirror:false});
  return {...e,eventId};
}
export async function lockProtectionState(db,userId,kind) {
  await db.execute('INSERT INTO activity_protection_state (user_id,kind) VALUES (?,?) ON DUPLICATE KEY UPDATE user_id=VALUES(user_id)',[userId,kind]);
  const [[state]]=await db.execute('SELECT held_at FROM activity_protection_state WHERE user_id=? AND kind=? FOR UPDATE',[userId,kind]);
  return state;
}
// Reservations are committed BEFORE data/link delivery or email dispatch. Failed
// downstream work conservatively consumes its reservation; retries cannot race it.
export async function authorizeProtectedActivity(req,{kind,resource,units=1,forceReview=false,hardLimit=false}) {
  if(!['client_file','email'].includes(kind) || !Number.isSafeInteger(units) || units<1) throw protectionError('Invalid protected operation.');
  const userId=protectionActor(req), ref=resourceReference(resource), event=protectionEvent(req,'activity_reserved','allowed',{kind,resourceRef:ref,units});
  if(!userId && !hardLimit) return; // Background per-account limits require an explicit initiating identity.
  const db=await pool.getConnection(); let committed=false, denied=false, recorded;
  try {
    await db.beginTransaction();
    const state=userId ? await lockProtectionState(db,userId,kind) : {};
    let duplicate=false;
    if(kind==='client_file' && !forceReview && !state.held_at) {
      const [[row]]=await db.execute('SELECT id FROM activity_protection_usage WHERE user_id=? AND kind=? AND resource_ref=? AND occurred_at>UTC_TIMESTAMP(3)-INTERVAL 15 MINUTE LIMIT 1',[userId,kind,ref]);
      duplicate=!!row;
    }
    const [[usage]]=await db.execute(`SELECT COALESCE(SUM(CASE WHEN occurred_at>UTC_TIMESTAMP(3)-INTERVAL 15 MINUTE THEN units ELSE 0 END),0) recent,COALESCE(SUM(units),0) daily FROM activity_protection_usage WHERE user_id=? AND kind=? AND occurred_at>UTC_TIMESTAMP(3)-INTERVAL 1 DAY`,[userId || 0,kind]);
    const limit=kind==='email'?PROTECTION_POLICY.emailPerWindow:PROTECTION_POLICY.filesPerWindow;
    const daily=kind==='email'?PROTECTION_POLICY.emailPerDay:PROTECTION_POLICY.filesPerDay;
    let needsReview=hardLimit || !!state.held_at || forceReview || (!duplicate && (Number(usage.recent)+units>limit || Number(usage.daily)+units>daily));
    let ticket=null;
    if(needsReview && kind==='client_file' && !hardLimit) {
      const [[grant]]=await db.execute(`SELECT id FROM activity_protection_tickets WHERE user_id=? AND session_ref=? AND kind=? AND status='approved' AND expires_at>UTC_TIMESTAMP(3) AND allowed_units-used_units>=? ORDER BY expires_at,id LIMIT 1 FOR UPDATE`,[userId,event.sessionRef,kind,units]);
      if(grant) { ticket=grant.id;needsReview=false;await db.execute('UPDATE activity_protection_tickets SET used_units=used_units+? WHERE id=?',[units,ticket]); }
    }
    if(needsReview) {
      if(userId) await db.execute('UPDATE activity_protection_state SET held_at=COALESCE(held_at,UTC_TIMESTAMP(3)) WHERE user_id=? AND kind=?',[userId,kind]);
      recorded=await recordProtectionAlert(db,req,{kind,reason:hardLimit?'recipient_hard_limit':forceReview?'bulk_operation':state.held_at?'review_hold':'volume_limit',units});
      denied=true;
    } else {
      if(!duplicate || ticket) await db.execute('INSERT INTO activity_protection_usage (user_id,kind,resource_ref,units,request_id,session_ref,ticket_id,occurred_at) VALUES (?,?,?,?,?,?,?,UTC_TIMESTAMP(3))',[userId,kind,ref,units,event.requestId,event.sessionRef,ticket]);
      event.details.ticketId=ticket;event.details.repeatResource=duplicate;
      const eventId=await appendSecurityEvidence(event,db,{mirror:false});recorded={...event,eventId};
    }
    await db.commit();committed=true;mirrorSecurityEvidence(recorded,recorded.eventId);
  } catch(e) {if(!committed)await db.rollback();throw e;} finally {db.release();}
  if(denied) throw protectionError(kind==='email'?'Email delivery paused for security review. No more than 50 recipients are allowed per message.':'To protect client privacy, additional file access is paused. Submit a request in Security & sign-in activity explaining why you need multiple files.');
}
export async function protectFileResource(resource, {req=evidenceRequestContext.getStore(),forceReview=false}={}) {
  if(!protectionActor(req)||['client_guardian','guardian','client','participant'].includes(req?.user?.role))return;
  const key=String(resource);
  req.protectionFiles ||= new Map();
  if(!req.protectionFiles.has(key)) req.protectionFiles.set(key,authorizeProtectedActivity(req,{kind:'client_file',resource:key,forceReview}));
  return req.protectionFiles.get(key);
}
export function recipientCount(...fields) {
  // Count actual mailbox tokens in To/Cc/Bcc, including duplicates conservatively.
  // Do not split display names on commas and accidentally undercount addresses.
  return fields.flat(Infinity).filter(v=>v!=null).reduce((n,v)=>n+(String(v).match(/[^\s<>(),;:"\[\]]+@[^\s<>(),;:"\[\]]+/g)||[]).length,0);
}
export async function protectOutboundEmail({to,cc,bcc,actorUserId=null}) {
  const current=evidenceRequestContext.getStore();
  const req=protectionActor(current)?current:actorUserId?{user:{id:actorUserId},method:'JOB',originalUrl:'/background-email',headers:{}}:current;
  const units=recipientCount(to,cc,bcc);
  if(!units)throw protectionError('A valid email recipient is required.','EMAIL_RECIPIENT_REQUIRED');
  if(units>PROTECTION_POLICY.emailPerMessage || protectionActor(req)) await authorizeProtectedActivity(req,{kind:'email',resource:crypto.randomUUID(),units,hardLimit:units>PROTECTION_POLICY.emailPerMessage});
}

export async function protectStorageResource(key) {
 const req=evidenceRequestContext.getStore();
 if(!protectionActor(req)||!/(?:^|\/)(phi-documents|intake_signed|intake_uploads)(?:\/|$)/i.test(String(key)))return;
 req.protectionStorage ||= new Map();
 if(!req.protectionStorage.has(String(key))){
  const covered=req.protectionRouteChecked && req.protectionStorage.size===0;
  req.protectionStorage.set(String(key),covered?Promise.resolve():protectFileResource(`storage:${key}`,{req,forceReview:/(?:^|\/)bundle(?:\/|$)/i.test(String(key))}));
 }
 return req.protectionStorage.get(String(key));
}
