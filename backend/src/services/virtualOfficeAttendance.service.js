import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { clinicalAudit } from './clinicalSessionAudit.service.js';

// Merge device overlap and reconnections; gaps do not count as connected time.
export function mergeAttendance(intervals) {
 const sorted=intervals.filter(([a,b])=>Number.isFinite(a)&&Number.isFinite(b)&&b>=a).sort((a,b)=>a[0]-b[0]);
 const merged=[];
 for(const [a,b] of sorted){const last=merged.at(-1);if(last&&a<=last[1])last[1]=Math.max(last[1],b);else merged.push([a,b]);}
 return {durationSeconds:Math.floor(merged.reduce((total,[a,b])=>total+b-a,0)/1000),segments:merged.map(([a,b])=>({joinedAt:new Date(a).toISOString(),leftAt:new Date(b).toISOString()}))};
}
export async function scheduledAttendance(sessionId,db=pool) {
 const [rows]=await db.execute(`SELECT v.id,v.actor,v.client_id,v.entry_method,v.office_visit_id,v.ip_address,v.ip_source,v.status,v.admitted_at,v.ended_at,
  c.connection_id,c.connected_at,c.disconnected_at,s.state,s.end_requested_at FROM counseling_session_visits v
  LEFT JOIN clinical_video_grants g ON g.visit_id=v.id AND g.participant_role='client'
  LEFT JOIN clinical_video_sessions s ON s.media_id=g.media_id AND s.session_kind='counseling' AND s.session_id=v.session_id
  LEFT JOIN clinical_video_connections c ON c.grant_id=g.id AND c.media_id=s.media_id
  WHERE v.session_id=? ORDER BY v.id,c.connected_at`,[sessionId]);
 const clients=new Map(),visits=new Map();const now=Date.now();
 for(const row of rows){
  const identity=row.client_id?`client-${row.client_id}`:row.actor;
  if(!clients.has(identity))clients.set(identity,{clientId:row.client_id?Number(row.client_id):null,identity,methods:new Set(),intervals:[],visitIds:new Set()});
  const client=clients.get(identity);client.methods.add(row.entry_method);client.visitIds.add(Number(row.id));
  if(!visits.has(Number(row.id)))visits.set(Number(row.id),{id:row.id,clientId:client.clientId,actor:row.actor,entryMethod:row.entry_method,officeVisitId:row.office_visit_id,ipAddress:row.ip_address,ipSource:row.ip_source,status:row.status,admittedAt:row.admitted_at,endedAt:row.ended_at,intervals:[]});
  if(row.connected_at){const interval=[new Date(row.connected_at).getTime(),row.disconnected_at?new Date(row.disconnected_at).getTime():now];client.intervals.push(interval);visits.get(Number(row.id)).intervals.push(interval);}
 }
 return {participants:[...clients.values()].map(c=>({clientId:c.clientId,identity:c.identity,entryMethods:[...c.methods],visitIds:[...c.visitIds],...mergeAttendance(c.intervals)})),visits:[...visits.values()].map(({intervals,...v})=>({...v,mediaDurationSeconds:intervals.length?mergeAttendance(intervals).durationSeconds:null,segments:mergeAttendance(intervals).segments})),...mergeAttendance([...clients.values()].flatMap(c=>c.intervals))};
}
// Retryable cross-database projection. It preserves clinical notes, scheduled time,
// billing duration and completion status; connection evidence is separate metadata.
export async function syncOfficeAttendance() {
 const [links]=await pool.execute(`SELECT l.*,s.provider_user_id FROM virtual_office_encounters l
  JOIN counseling_sessions s ON s.id=l.counseling_session_id AND s.agency_id=l.agency_id
  WHERE l.synced_version<l.attendance_version AND l.appointment_id IS NOT NULL ORDER BY l.linked_at LIMIT 100`);
 for(const link of links){
  try {
   const attendance=await scheduledAttendance(link.counseling_session_id);
   const [[appointment]]=await pool.execute('SELECT office_event_id FROM appointments WHERE id=? AND agency_id=? AND provider_user_id=?',[link.appointment_id,link.agency_id,link.provider_user_id]);
   if(!appointment)throw Object.assign(new Error('Appointment changed.'),{code:'APPOINTMENT_SCOPE_CHANGED'});
   for(const participant of attendance.participants.filter(p=>p.clientId&&p.segments.length)){
    const metadata={source:'virtual_office',officeRoomId:link.room_id,officeGeneration:link.generation,counselingSessionId:link.counseling_session_id,appointmentId:link.appointment_id,clientId:participant.clientId,entryMethods:participant.entryMethods,connectedSeconds:participant.durationSeconds,segments:participant.segments,updatedAt:new Date().toISOString()};
    const [result]=await clinicalPool.execute(`UPDATE clinical_sessions SET metadata_json=JSON_SET(COALESCE(metadata_json,JSON_OBJECT()),'$.virtualAttendance',CAST(? AS JSON))
     WHERE agency_id=? AND client_id=? AND provider_user_id=? AND (appointment_id=? OR (? IS NOT NULL AND office_event_id=?))`,[JSON.stringify(metadata),link.agency_id,participant.clientId,link.provider_user_id,link.appointment_id,appointment.office_event_id,appointment.office_event_id]);
    if(!result.affectedRows)throw Object.assign(new Error('Clinical appointment record is not linked yet.'),{code:'CLINICAL_APPOINTMENT_LINK_PENDING'});
   }
   await clinicalAudit({kind:'counseling',sessionId:link.counseling_session_id,agencyId:link.agency_id},'clinical_attendance_record_synced',{appointmentId:link.appointment_id,version:link.attendance_version});
   await pool.execute('UPDATE virtual_office_encounters SET synced_version=? WHERE room_id=? AND generation=?',[link.attendance_version,link.room_id,link.generation]);
  }catch(error){console.warn(JSON.stringify({severity:'WARNING',component:'clinical_office_attendance_sync',code:error.code||'ATTENDANCE_SYNC_FAILED'}));}
 }
}
