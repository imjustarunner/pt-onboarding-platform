import pool from '../config/database.js';
import { clinicalAudit } from './clinicalSessionAudit.service.js';
import { retryClinicalDisconnections } from './clinicalVideo.service.js';

export function validateClinicalRetention(days) {
 if(days!==null && (!Number.isInteger(days)||days<1||days>36500))throw Object.assign(new Error('Use a retention period from 1 to 36,500 days, or retain records without automatic deletion.'),{status:400});
 return days;
}
export async function runClinicalSessionMaintenance() {
 // Transient recognition photos are never clinical-record attachments. Cleanup runs without a lobby viewer.
 const [photos]=await pool.execute(`UPDATE private_virtual_office_visits SET photo_envelope=NULL
   WHERE photo_envelope IS NOT NULL AND (status IN ('dismissed','ended') OR expires_at<=UTC_TIMESTAMP()
   OR (status='waiting' AND last_seen_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 MINUTE)))`);
 await pool.execute(`UPDATE private_virtual_office_visits SET status='ended',ended_at=last_seen_at,duration_seconds=0
   WHERE status='waiting' AND (expires_at<=UTC_TIMESTAMP() OR last_seen_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 MINUTE))`);
 if(photos.affectedRows)await clinicalAudit({},'clinical_transient_photos_removed',{count:photos.affectedRows});
 await retryClinicalDisconnections();
 // Only finalized encounters under an explicit tenant policy are candidates. No default PHI purge.
 const [candidates]=await pool.execute(`SELECT s.media_id FROM clinical_video_sessions s
   JOIN clinical_session_retention p ON p.agency_id=s.agency_id
   WHERE s.state='ended' AND s.legal_hold=FALSE AND p.artifact_days IS NOT NULL
   AND s.ended_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL p.artifact_days DAY)
   AND EXISTS (SELECT 1 FROM therapy_session_artifacts a WHERE a.session_kind=s.session_kind
     AND a.session_id=s.session_id AND a.generation=s.generation AND a.agency_id=s.agency_id) LIMIT 100`);
 for(const candidate of candidates) {
  const db=await pool.getConnection();
  try {
   await db.beginTransaction();
   const [[session]]=await db.execute('SELECT * FROM clinical_video_sessions WHERE media_id=? FOR UPDATE',[candidate.media_id]);
   const [[policy]]=await db.execute('SELECT * FROM clinical_session_retention WHERE agency_id=? FOR UPDATE',[session.agency_id]);
   if(!session.legal_hold && session.state==='ended' && policy?.artifact_days!=null && new Date(session.ended_at).getTime()<Date.now()-policy.artifact_days*86400000) {
    const [deleted]=await db.execute('DELETE FROM therapy_session_artifacts WHERE session_kind=? AND session_id=? AND generation=? AND agency_id=?',[session.session_kind,session.session_id,session.generation,session.agency_id]);
    await clinicalAudit({kind:session.session_kind,sessionId:session.session_id,generation:session.generation,agencyId:session.agency_id},'clinical_artifacts_retention_deleted',{count:deleted.affectedRows,retentionDays:policy.artifact_days},db);
   }
   await db.commit();
  }catch(error){await db.rollback();throw error;}finally{db.release();}
 }
}
