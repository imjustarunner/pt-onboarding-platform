import * as clinical from './clinicalVideo.service.js';
import { clinicalAudit } from './clinicalSessionAudit.service.js';
import { networkEvidence } from '../utils/securityEvidence.js';
import pool from '../config/database.js';
const key=req=>req.counselingInvitationAccess?`client-${req.counselingInvitationAccess.clientId}`:`user-${req.user.id}`;
export async function joinCounselingVisit(req,session) {
 const actor=key(req);
 // Serialize re-entry so concurrent tabs cannot create duplicate open visits.
 const db=await pool.getConnection();
 try{await db.beginTransaction();const [[current]]=await db.execute('SELECT id,status FROM counseling_sessions WHERE id=? FOR UPDATE',[session.id]);
 if(!current||current.status==='ended')throw Object.assign(new Error('This session has ended.'),{status:410});
 const [rows]=await db.execute("SELECT * FROM counseling_session_visits WHERE session_id=? AND actor=? AND status IN ('waiting','admitted') ORDER BY id DESC LIMIT 1",[session.id,actor]);
 if(rows[0]) {await db.commit();return rows[0];}
 const [r]=await db.execute('INSERT INTO counseling_session_visits (session_id,actor,ip_address,ip_source) VALUES (?,?,?,?)',[session.id,actor,networkEvidence(req).clientIp,networkEvidence(req).ipSource]);await db.commit();return {id:r.insertId,status:'waiting'};
 }catch(e){await db.rollback();throw e;}finally{db.release();}
}
export async function counselingVisitStatus(req,session,provider=false) {
 if(provider){await pool.execute("UPDATE counseling_session_visits SET status='ended',ended_at=last_seen_at,duration_seconds=IF(admitted_at IS NULL,0,GREATEST(0,TIMESTAMPDIFF(SECOND,admitted_at,last_seen_at))) WHERE session_id=? AND status='waiting' AND last_seen_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 MINUTE)",[session.id]);const [visits]=await pool.execute('SELECT id,actor,ip_address AS ipAddress,status,admitted_at AS admittedAt,ended_at AS endedAt,duration_seconds AS durationSeconds FROM counseling_session_visits WHERE session_id=? ORDER BY id DESC LIMIT 100',[session.id]);const durations=await clinical.clinicalAttendance('counseling',session.id);return {visits:visits.map(v=>({...v,mediaDurationSeconds:durations.get(Number(v.id))??null}))};}
 const [rows]=await pool.execute('SELECT id,status FROM counseling_session_visits WHERE session_id=? AND actor=? ORDER BY id DESC LIMIT 1',[session.id,key(req)]);
 if(rows[0])await pool.execute('UPDATE counseling_session_visits SET last_seen_at=UTC_TIMESTAMP() WHERE id=?',[rows[0].id]);
 return {visit:rows[0]||null};
}
export async function requireCounselingAdmission(req,session) {
 const [rows]=await pool.execute("SELECT id FROM counseling_session_visits WHERE session_id=? AND actor=? AND status='admitted' LIMIT 1",[session.id,key(req)]);
 if(!rows[0])throw Object.assign(new Error('Wait for your provider to admit you.'),{status:403});
 return rows[0];
}
export async function admitCounselingVisit(session,id,req) {
 const db=await pool.getConnection();
 try {
  await db.beginTransaction();
  const [[current]]=await db.execute('SELECT * FROM counseling_sessions WHERE id=? FOR UPDATE',[session.id]);
  if(!current||current.status==='ended'||!current.vonage_session_id)throw Object.assign(new Error('The provider must open this session first.'),{status:409});
  await clinical.requireMonitoredProvider(current.vonage_session_id,db);
  const [r]=await db.execute("UPDATE counseling_session_visits SET status='admitted',admitted_at=UTC_TIMESTAMP(),last_seen_at=UTC_TIMESTAMP() WHERE id=? AND session_id=? AND status='waiting'",[id,session.id]);
  if(!r.affectedRows)throw Object.assign(new Error('This client is no longer waiting.'),{status:409});
  await clinicalAudit({kind:'counseling',sessionId:session.id,agencyId:session.agency_id,role:'provider',req},'clinical_client_admitted',{visitId:id},db);
  await db.commit();return {ok:true};
 }catch(e){await db.rollback();throw e;}finally{db.release();}
}
export async function leaveCounselingVisit(req,session,all=false) {
 const db=await pool.getConnection();
 try {
  await db.beginTransaction();
  const [[current]]=await db.execute('SELECT * FROM counseling_sessions WHERE id=? FOR UPDATE',[session.id]);
  if(current?.vonage_session_id) {
   await clinical.clinicalMedia(current.vonage_session_id,db,true);
   if(all)await clinical.requestClinicalEnd(current.vonage_session_id,req,db);
   else await clinical.revokeClinicalActor(current.vonage_session_id,key(req),db);
  }
  await db.execute(`UPDATE counseling_session_visits SET status='ended',ended_at=UTC_TIMESTAMP(),duration_seconds=IF(admitted_at IS NULL,0,GREATEST(0,TIMESTAMPDIFF(SECOND,admitted_at,UTC_TIMESTAMP()))) WHERE session_id=? AND status IN ('waiting','admitted') ${all?'':'AND actor=?'}`,all?[session.id]:[session.id,key(req)]);
  await clinicalAudit({kind:'counseling',sessionId:session.id,agencyId:session.agency_id,actor:key(req),role:'client',req},'clinical_client_left',{},db);
  await db.commit();
 }catch(e){await db.rollback();throw e;}finally{db.release();}
 await clinical.retryClinicalDisconnections();
 return {ok:true};
}
