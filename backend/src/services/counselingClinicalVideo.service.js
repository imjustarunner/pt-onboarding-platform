import {officeForHost,officeHostVideo} from './privateVirtualOffice.service.js';
import {markOfficeAttendance} from './virtualOfficeSchedule.service.js';
import pool from '../config/database.js';
import * as clinical from './clinicalVideo.service.js';
import { clinicalAudit } from './clinicalSessionAudit.service.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export const counselingActor=req=>req.counselingInvitationAccess?`client-${req.counselingInvitationAccess.clientId}`:`user-${req.user.id}`;

export async function counselingClinicalToken(req,sessionId,role,{token=true}={}) {
 if(role==='provider'){
  const [[scheduled]]=await pool.execute('SELECT id,agency_id,provider_user_id,status FROM counseling_sessions WHERE id=?',[sessionId]);
  if(!scheduled||scheduled.status==='ended')throw fail(410,'This session has ended.');
  if(Number(scheduled.provider_user_id)!==Number(req.user?.id))throw fail(403,'Only the scheduled provider can open this session.');
  const {room}=await officeForHost(req.user.id,scheduled.agency_id);
  const credentials=await officeHostVideo(room,{sessionId,req});
  return {...credentials,participantRole:'provider'};
 }
 const db=await pool.getConnection();
 try {
  await db.beginTransaction();
  const [[session]]=await db.execute('SELECT * FROM counseling_sessions WHERE id=? FOR UPDATE',[sessionId]);
  if(!session||session.status==='ended')throw fail(410,'This session has ended.');
  let mediaId=session.vonage_session_id;
  if(!mediaId)throw fail(409,'Wait for the provider to open the session.');
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
  await db.execute("UPDATE private_virtual_office_visits v JOIN virtual_office_encounters l ON l.room_id=v.room_id AND l.generation=v.generation SET v.status='ended',v.photo_envelope=NULL,v.ended_at=UTC_TIMESTAMP(),v.duration_seconds=GREATEST(0,TIMESTAMPDIFF(SECOND,v.admitted_at,UTC_TIMESTAMP())) WHERE l.counseling_session_id=? AND v.status IN ('admitted','waiting')",[sessionId]);
  await markOfficeAttendance(sessionId,db);
  await db.execute("UPDATE counseling_sessions SET status='ended',ended_at=COALESCE(ended_at,UTC_TIMESTAMP()) WHERE id=?",[sessionId]);
  await db.execute("UPDATE counseling_session_visits SET status='ended',ended_at=UTC_TIMESTAMP(),duration_seconds=IF(admitted_at IS NULL,0,GREATEST(0,TIMESTAMPDIFF(SECOND,admitted_at,UTC_TIMESTAMP()))) WHERE session_id=? AND status IN ('waiting','admitted')",[sessionId]);
  await clinicalAudit({kind:'counseling',sessionId,agencyId:session.agency_id,role:'provider',req},'clinical_counseling_ended',{},db);
  await db.commit();
 }catch(error){await db.rollback();throw error;}finally{db.release();}
 return mediaId?clinical.finishClinicalEnd(mediaId):{ok:true,state:'ended'};
}
