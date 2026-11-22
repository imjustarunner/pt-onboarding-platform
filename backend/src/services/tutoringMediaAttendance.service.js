import {clinicalAudit} from './clinicalSessionAudit.service.js';
import pool from '../config/database.js';
import {utcMysqlToIso} from '../utils/zonedWallTime.util.js';
import {clinicalAttendance} from './clinicalVideo.service.js';

export async function endConnectedTutoringVisits(session,db,only=null){
 const measured=await clinicalAttendance('tutoring',session.id,db);
 const intervals=measured instanceof Map?[...measured.entries()]:[];
 const cases=intervals.length?'CASE id '+intervals.map(()=> 'WHEN ? THEN ?').join(' ')+' ELSE 0 END':'0';
 await db.execute(`UPDATE tutoring_session_visits SET status='ended',ended_at=UTC_TIMESTAMP(),duration_seconds=${cases}
  WHERE session_id=? ${only?`AND ${only.column}=?`:''} AND status IN ('waiting','admitted')`,[...intervals.flat(),session.id,...(only?[only.value]:[])]);
 return intervals.length>0;
}

// Called inside the verified media-webhook transaction. Admission authorizes a
// connection; it is not proof that either person's device connected.
export async function startConnectedTutoringSession(media,db=null) {
 if(!db){const connection=await pool.getConnection();try{await connection.beginTransaction();const result=await startConnectedTutoringSession(media,connection);await connection.commit();return result;}catch(e){await connection.rollback();throw e;}finally{connection.release();}}
 // Match scheduling's lock order; never hold the webhook's media lock while
 // acquiring the appointment/session locks.
 const [[appointment]]=await db.execute(`SELECT a.id FROM appointments a JOIN tutoring_appointment_sessions b ON b.appointment_id=a.id
  WHERE b.session_id=? AND a.status IN ('scheduled','confirmed','client_confirmed','in_progress') FOR UPDATE`,[media.session_id]);
 if(!appointment)return false;
 const [[session]]=await db.execute(`SELECT s.id,s.actual_started_at,b.appointment_id FROM learning_class_sessions s
  JOIN tutoring_appointment_sessions b ON b.session_id=s.id WHERE s.id=? AND s.booked_media_id=?
  AND s.status IN ('scheduled','live') AND s.actual_ended_at IS NULL FOR UPDATE`,[media.session_id,media.media_id]);
 if(!session||session.actual_started_at)return false;
 const [[presence]]=await db.execute(`SELECT
  MIN(CASE WHEN g.participant_role='provider' THEN c.connected_at END) AS provider_connected,
  MIN(CASE WHEN g.participant_role='client' AND v.status='admitted' THEN c.connected_at END) AS family_connected
  FROM clinical_video_connections c JOIN clinical_video_grants g ON g.id=c.grant_id
  LEFT JOIN tutoring_session_visits v ON v.id=g.visit_id AND v.session_id=?
  JOIN clinical_video_sessions m ON m.media_id=c.media_id AND m.state='active'
  WHERE c.media_id=? AND c.disconnected_at IS NULL AND c.disconnect_requested=0 AND g.revoked_at IS NULL
  AND c.connected_at<=g.expires_at`,[session.id,media.media_id]);
 if(!presence?.provider_connected||!presence?.family_connected)return false;
 const startedAt=new Date(Math.max(Date.parse(utcMysqlToIso(presence.provider_connected)),Date.parse(utcMysqlToIso(presence.family_connected))));
 const [updated]=await db.execute(`UPDATE learning_class_sessions SET status='live',actual_started_at=?
  WHERE id=? AND actual_started_at IS NULL AND actual_ended_at IS NULL`,[startedAt,session.id]);
 if(!updated.affectedRows)return false;
 await db.execute("UPDATE appointments SET status='in_progress' WHERE id=? AND status IN ('scheduled','confirmed','client_confirmed')",[session.appointment_id]);
 await clinicalAudit({kind:'tutoring',sessionId:session.id,agencyId:media.agency_id,actor:'system:tutoring-media',role:'system'},
  'tutoring_connected_session_started',{appointmentId:session.appointment_id,source:'verified_media_connections'},db);
 return true;
}
