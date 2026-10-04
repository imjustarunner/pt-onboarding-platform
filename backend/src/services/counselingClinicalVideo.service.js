import pool from '../config/database.js';
import Video from './vonageVideo.service.js';
import * as clinical from './clinicalVideo.service.js';
import { clinicalAudit } from './clinicalSessionAudit.service.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export const counselingActor=req=>req.counselingInvitationAccess?`client-${req.counselingInvitationAccess.clientId}`:`user-${req.user.id}`;

export async function counselingClinicalToken(req,sessionId,role,{token=true}={}) {
 const db=await pool.getConnection();
 try {
  await db.beginTransaction();
  const [[session]]=await db.execute('SELECT * FROM counseling_sessions WHERE id=? FOR UPDATE',[sessionId]);
  if(!session||session.status==='ended')throw fail(410,'This session has ended.');
  let mediaId=session.vonage_session_id;
  if(!mediaId) {
   if(role!=='provider')throw fail(409,'Wait for the provider to open the session.');
   clinical.requireClinicalVideoMonitoring();
   mediaId=await Video.createSession();
   await clinical.registerClinicalMedia(mediaId,{kind:'counseling',sessionId,agencyId:session.agency_id,req},db);
   await db.execute(`UPDATE counseling_sessions SET vonage_session_id=?,vonage_application_id=?,status='active',started_at=COALESCE(started_at,UTC_TIMESTAMP()) WHERE id=?`,[mediaId,process.env.VONAGE_APPLICATION_ID,sessionId]);
  }
  await clinical.requireActiveClinicalMedia(mediaId,db);
  let visitId=null;
  if(role!=='provider') {
   const [[visit]]=await db.execute("SELECT id FROM counseling_session_visits WHERE session_id=? AND actor=? AND status='admitted' ORDER BY id DESC LIMIT 1",[sessionId,counselingActor(req)]);
   if(!visit)throw fail(403,'Wait for your provider to admit you.');
   visitId=visit.id;
  }
  const value=token?await clinical.clinicalVideoToken(mediaId,{actor:counselingActor(req),role,visitId,req},db):null;
  await db.commit();
  return {sessionId:mediaId,token:value,applicationId:process.env.VONAGE_APPLICATION_ID,participantRole:role};
 }catch(error){await db.rollback();throw error;}finally{db.release();}
}
export async function endClinicalCounseling(req,sessionId) {
 const db=await pool.getConnection();let mediaId;
 try {
  await db.beginTransaction();
  const [[session]]=await db.execute('SELECT * FROM counseling_sessions WHERE id=? FOR UPDATE',[sessionId]);
  if(!session)throw fail(404,'Session not found.');
  mediaId=session.vonage_session_id;
  if(mediaId)await clinical.requestClinicalEnd(mediaId,req,db);
  await db.execute("UPDATE counseling_sessions SET status='ended',ended_at=COALESCE(ended_at,UTC_TIMESTAMP()) WHERE id=?",[sessionId]);
  await db.execute("UPDATE counseling_session_visits SET status='ended',ended_at=UTC_TIMESTAMP(),duration_seconds=IF(admitted_at IS NULL,0,GREATEST(0,TIMESTAMPDIFF(SECOND,admitted_at,UTC_TIMESTAMP()))) WHERE session_id=? AND status IN ('waiting','admitted')",[sessionId]);
  await clinicalAudit({kind:'counseling',sessionId,agencyId:session.agency_id,role:'provider',req},'clinical_counseling_ended',{},db);
  await db.commit();
 }catch(error){await db.rollback();throw error;}finally{db.release();}
 return mediaId?clinical.finishClinicalEnd(mediaId):{ok:true,state:'ended'};
}
