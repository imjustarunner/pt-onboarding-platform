import crypto from 'node:crypto';
import pool from '../config/database.js';
import { accountSecurityState, requireAccountSession } from '../services/accountSecurity.service.js';
import { PROTECTION_POLICY, protectionActor, protectionError, protectionEvent, lockProtectionState, protectFileResource } from '../services/activityProtection.service.js';
import { appendSecurityEvidence, mirrorSecurityEvidence } from '../services/securityEvidence.service.js';
import { MFA_STAFF_ROLES } from '../utils/accountSecurity.js';
import { sessionReference } from '../utils/securityEvidence.js';

export const ownProtection = async(req,res,next)=>{try{
 requireAccountSession(req);res.setHeader('Cache-Control','no-store');
 const [tickets]=await pool.execute('SELECT * FROM activity_protection_tickets WHERE user_id=? ORDER BY created_at DESC LIMIT 50',[req.user.id]);
 const [holds]=await pool.execute('SELECT kind,held_at FROM activity_protection_state WHERE user_id=? AND held_at IS NOT NULL',[req.user.id]);
 res.json({tickets,holds,policy:PROTECTION_POLICY});
}catch(e){next(e);}};
export const requestFileAccess=async(req,res,next)=>{let db;try{
 requireAccountSession(req);
 const state=await accountSecurityState(req);if(!state.verified)throw protectionError('Verify your sign-in before requesting additional file access.','MFA_REQUIRED');
 const reason=String(req.body?.reason||'').trim(), units=Number(req.body?.units);
 if(reason.length<20||reason.length>2000||!Number.isInteger(units)||units<1||units>PROTECTION_POLICY.approvalMaxUnits)throw protectionError('Explain the work purpose in 20–2000 characters and request 1–20 file operations. Do not include client names.','INVALID_REVIEW_REQUEST');
 db=await pool.getConnection();await db.beginTransaction();await lockProtectionState(db,req.user.id,'client_file');
 const [[pending]]=await db.execute("SELECT id FROM activity_protection_tickets WHERE user_id=? AND kind='client_file' AND status='pending' LIMIT 1",[req.user.id]);
 if(pending){await db.commit();return res.json({id:pending.id,pending:true,message:'You already have a request awaiting review.'});}
 const [[rate]]=await db.execute('SELECT COUNT(*) n FROM activity_protection_tickets WHERE user_id=? AND created_at>UTC_TIMESTAMP(3)-INTERVAL 1 DAY',[req.user.id]);
 if(Number(rate.n)>=10)throw protectionError('Too many requests today. Contact your security reviewer.');
 const id=crypto.randomUUID();
 await db.execute("INSERT INTO activity_protection_tickets (id,user_id,session_ref,kind,reason,requested_units,created_at) VALUES (?,?,?,'client_file',?,?,UTC_TIMESTAMP(3))",[id,req.user.id,sessionReference(req.user.sessionId),reason,units]);
 const event=protectionEvent(req,'file_access_requested','pending',{ticketId:id,units});const eventId=await appendSecurityEvidence(event,db,{mirror:false});await db.commit();mirrorSecurityEvidence(event,eventId);
 res.status(201).json({id,pending:true});
}catch(e){if(db)await db.rollback();next(e);}finally{db?.release();}};
export const reviewQueue=async(req,res,next)=>{try{
 res.setHeader('Cache-Control','no-store');
 let cursor=null;
 if(req.query.cursor){try{cursor=JSON.parse(Buffer.from(String(req.query.cursor),'base64url').toString());if(!Number.isFinite(Date.parse(cursor.at))||!/^[a-f0-9-]{36}$/.test(cursor.id))throw new Error();}catch{throw protectionError('Invalid alert cursor.');}}
 const [alerts]=await pool.execute(`SELECT a.*,u.email actor_email FROM activity_protection_alerts a LEFT JOIN users u ON u.id=a.user_id ${cursor?'WHERE (a.occurred_at<? OR (a.occurred_at=? AND a.id<?))':''} ORDER BY a.occurred_at DESC,a.id DESC LIMIT 101`,cursor?[new Date(cursor.at),new Date(cursor.at),cursor.id]:[]);
 const [tickets]=await pool.execute("SELECT t.*,u.email actor_email FROM activity_protection_tickets t LEFT JOIN users u ON u.id=t.user_id WHERE t.status='pending' ORDER BY t.created_at LIMIT 100");
 res.json({alerts:alerts.slice(0,100),tickets,policy:PROTECTION_POLICY,nextCursor:alerts.length>100?Buffer.from(JSON.stringify({at:new Date(alerts[99].occurred_at).toISOString(),id:alerts[99].id})).toString('base64url'):null});
}catch(e){next(e);}};
async function freshReviewer(req){
 const state=await accountSecurityState(req);
 // Remembered-device proof alone is not enough to approve exceptions.
 const [[proof]]=await pool.execute('SELECT verified_at,device_id FROM account_mfa_sessions WHERE session_key=?',[req.sessionSecurity?.key||'']);
 if(!state.verified||!proof||proof.device_id||Date.now()-new Date(proof.verified_at).getTime()>5*60000)throw protectionError('Enter a fresh authenticator code without remembering the device, then return to review.','MFA_FRESH_REQUIRED');
}
export const reviewTicket=async(req,res,next)=>{let db;try{
 await freshReviewer(req);
 const decision=req.body?.decision,note=String(req.body?.note||'').trim(),units=Number(req.body?.units);
 if(!['approved','denied'].includes(decision)||note.length<10||note.length>1000)throw protectionError('Add a review explanation (10–1000 characters).','INVALID_REVIEW');
 const [[target]]=await pool.execute('SELECT user_id FROM activity_protection_tickets WHERE id=?',[req.params.id]);if(!target)throw protectionError('Request not found.');
 if(Number(target.user_id)===protectionActor(req))throw protectionError('Another designated privacy reviewer must review your request.','SELF_APPROVAL_FORBIDDEN');
 db=await pool.getConnection();await db.beginTransaction();await lockProtectionState(db,target.user_id,'client_file');
 const [[ticket]]=await db.execute("SELECT * FROM activity_protection_tickets WHERE id=? AND status='pending' FOR UPDATE",[req.params.id]);if(!ticket)throw protectionError('This request has already been reviewed.');
 if(decision==='approved'&&(!Number.isInteger(units)||units<1||units>Math.min(ticket.requested_units,PROTECTION_POLICY.approvalMaxUnits)))throw protectionError('The approved quantity must be within the requested limit.');
 await db.execute('UPDATE activity_protection_tickets SET status=?,reviewer_id=?,reviewed_at=UTC_TIMESTAMP(3),review_note=?,allowed_units=?,expires_at=UTC_TIMESTAMP(3)+INTERVAL 60 MINUTE WHERE id=?',[decision,req.user.id,note,decision==='approved'?units:0,ticket.id]);
 if(decision==='approved')await db.execute("UPDATE activity_protection_state SET held_at=NULL WHERE user_id=? AND kind='client_file'",[ticket.user_id]);
 const event=protectionEvent(req,'file_access_reviewed',decision,{ticketId:ticket.id,targetUserId:ticket.user_id,units:decision==='approved'?units:0});const eventId=await appendSecurityEvidence(event,db,{mirror:false});await db.commit();mirrorSecurityEvidence(event,eventId);
 res.json({reviewed:true,decision});
}catch(e){if(db)await db.rollback();next(e);}finally{db?.release();}};
export const reviewAlert=async(req,res,next)=>{let db;try{
 await freshReviewer(req);const note=String(req.body?.note||'').trim();if(note.length<10||note.length>1000)throw protectionError('Add a review explanation (10–1000 characters).');
 db=await pool.getConnection();await db.beginTransaction();
 const [[alert]]=await db.execute('SELECT * FROM activity_protection_alerts WHERE id=? FOR UPDATE',[req.params.id]);
 if(!alert)throw protectionError('Alert not found.');if(alert.reviewed_at)throw protectionError('This alert has already been reviewed.');if(Number(alert.user_id)===protectionActor(req))throw protectionError('Another designated privacy reviewer must review your activity.','SELF_APPROVAL_FORBIDDEN');
 // Acknowledgement preserves the hold. Email release is explicit and separately audited.
 if(req.body?.releaseEmail===true && alert.kind==='email')await db.execute("UPDATE activity_protection_state SET held_at=NULL WHERE user_id=? AND kind='email'",[alert.user_id]);
 await db.execute('UPDATE activity_protection_alerts SET reviewed_at=UTC_TIMESTAMP(3),reviewed_by=?,review_note=? WHERE id=?',[req.user.id,note,alert.id]);
 const event=protectionEvent(req,'security_alert_reviewed','succeeded',{alertId:alert.id,targetUserId:alert.user_id,emailHoldReleased:req.body?.releaseEmail===true&&alert.kind==='email'});const eventId=await appendSecurityEvidence(event,db,{mirror:false});await db.commit();mirrorSecurityEvidence(event,eventId);res.json({reviewed:true});
}catch(e){if(db)await db.rollback();next(e);}finally{db?.release();}};
export const printIntent=async(req,res,next)=>{try{
 requireAccountSession(req);const state=await accountSecurityState(req);if(!state.verified)throw protectionError('Verify your sign-in first.','MFA_REQUIRED');
 await protectFileResource('application-print',{req,forceReview:true});res.json({allowed:true,notice:'Permission to open the print dialog; this does not confirm a physical print.'});
}catch(e){next(e);}};

export const protectionSummary=async(req,res,next)=>{try{
 const [[alerts]]=await pool.execute('SELECT COUNT(*) n FROM activity_protection_alerts WHERE reviewed_at IS NULL');
 const [[tickets]]=await pool.execute("SELECT COUNT(*) n FROM activity_protection_tickets WHERE status='pending'");
 res.setHeader('Cache-Control','no-store');res.json({alerts:Number(alerts.n),requests:Number(tickets.n)});
}catch(e){next(e);}};

export async function isPrivacyReviewer(userId){
 const [[row]]=await pool.execute('SELECT u.role FROM privacy_reviewers p JOIN users u ON u.id=p.user_id WHERE p.user_id=? AND p.revoked_at IS NULL',[userId]);
 return !!row && MFA_STAFF_ROLES.has(row.role);
}
export async function requirePrivacyReviewer(req,res,next){try{
 requireAccountSession(req);
 if(!await isPrivacyReviewer(req.user.id))return res.status(403).json({error:{code:'PRIVACY_REVIEWER_REQUIRED',message:'A designated privacy reviewer must handle this request. Administrator status alone does not grant review permission.'}});
 if(!(await accountSecurityState(req)).verified)throw protectionError('Verify your sign-in to open the privacy review queue.','MFA_REQUIRED');
 next();
}catch(e){next(e);}}
export const listPrivacyReviewers=async(req,res,next)=>{try{
 const [reviewers]=await pool.execute('SELECT p.user_id,p.assigned_by,p.assigned_at,p.revoked_at,u.email,u.role FROM privacy_reviewers p JOIN users u ON u.id=p.user_id ORDER BY p.revoked_at IS NOT NULL,p.assigned_at DESC');
 res.setHeader('Cache-Control','no-store');res.json({reviewers});
}catch(e){next(e);}};
export const assignPrivacyReviewer=async(req,res,next)=>{let db;try{
 requireAccountSession(req);await freshReviewer(req);
 const userId=Number(req.body?.userId),note=String(req.body?.note||'').trim(),enabled=req.body?.enabled;
 if(!Number.isSafeInteger(userId)||userId<=0||Number(req.body?.confirmUserId)!==userId||typeof enabled!=='boolean'||note.length<10||note.length>1000)throw protectionError('Confirm the user ID and explain the reviewer assignment.');
 if(enabled&&userId===Number(req.user.id))throw protectionError('Another security administrator must designate you as a reviewer.','SELF_APPROVAL_FORBIDDEN');
 const [[target]]=await pool.execute('SELECT id,role,email,status FROM users WHERE id=?',[userId]);
 if(!target||!MFA_STAFF_ROLES.has(target.role))throw protectionError('Choose an existing staff account for this privacy responsibility.');
 db=await pool.getConnection();await db.beginTransaction();
 if(enabled)await db.execute('INSERT INTO privacy_reviewers (user_id,assigned_by,assigned_at) VALUES (?,?,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE assigned_by=VALUES(assigned_by),assigned_at=VALUES(assigned_at),revoked_at=NULL',[userId,req.user.id]);
 else await db.execute('UPDATE privacy_reviewers SET revoked_at=UTC_TIMESTAMP(3) WHERE user_id=?',[userId]);
 const event=protectionEvent(req,'privacy_reviewer_assignment',enabled?'granted':'revoked',{targetUserId:userId,reason:note});const eventId=await appendSecurityEvidence(event,db,{mirror:false});await db.commit();mirrorSecurityEvidence(event,eventId);
 res.json({userId,email:target.email,enabled});
}catch(e){if(db)await db.rollback();next(e);}finally{db?.release();}};
