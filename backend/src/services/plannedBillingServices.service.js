import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
const missing=e=>['ER_NO_SUCH_TABLE','ER_BAD_FIELD_ERROR'].includes(e.code);
export async function plannedBillingServices(agencyId,d={main:pool,clinical:clinicalPool}){
  // Planned sessions are work items, never original claims or amounts owed.
  const [sessions]=await d.clinical.execute(`SELECT s.id AS sessionId,s.appointment_id AS appointmentId,s.client_id AS clientId,s.provider_user_id AS providerId,s.office_event_id AS officeEventId,s.service_code AS serviceCode,
    JSON_UNQUOTE(JSON_EXTRACT(s.metadata_json,'$.serviceDate')) AS serviceDate,
    s.scheduled_start_at AS startAt,s.source_timezone AS timeZone,
    (SELECT n.id FROM clinical_notes n WHERE n.clinical_session_id=s.id AND n.agency_id=s.agency_id AND n.is_deleted=0 ORDER BY n.id DESC LIMIT 1) AS noteId,
    (SELECT n.provider_signed_at FROM clinical_notes n WHERE n.clinical_session_id=s.id AND n.agency_id=s.agency_id AND n.is_deleted=0 ORDER BY n.id DESC LIMIT 1) AS signedAt
    FROM clinical_sessions s WHERE s.agency_id=? AND s.service_code IS NOT NULL
    AND LOWER(COALESCE(s.encounter_status,'')) NOT IN ('cancelled','canceled','no_show','void','voided','rescheduled')
    AND NOT EXISTS(SELECT 1 FROM clinical_claims c WHERE c.clinical_session_id=s.id AND c.agency_id=s.agency_id AND c.is_deleted=0)
    ORDER BY s.scheduled_start_at DESC,s.id DESC LIMIT 201`,[agencyId]);
  let appointments=[],unavailable=false;
  try{
    [appointments]=await d.main.execute(`SELECT a.id AS appointmentId,a.clinical_session_id AS sessionId,a.office_event_id AS officeEventId,ap.client_id AS clientId,a.provider_user_id AS providerId,a.service_code AS serviceCode,a.start_at AS startAt,a.source_timezone AS timeZone
      FROM appointments a JOIN appointment_participants ap ON ap.appointment_id=a.id AND ap.role='client' JOIN clients c ON c.id=ap.client_id AND c.agency_id=a.agency_id
      WHERE a.agency_id=? AND a.service_code IS NOT NULL AND a.start_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 90 DAY)
      AND LOWER(COALESCE(a.status,'')) NOT IN ('cancelled','canceled','no_show','void','voided','rescheduled')
      ORDER BY a.start_at DESC,a.id DESC LIMIT 201`,[agencyId]);
  }catch(e){if(!missing(e))throw e;unavailable=true;}
  // Match only persistent encounter IDs (including office linkage), never dates/names alone.
  const linked=appointments;
  let existing=[];
  if(linked.length){const sessionIds=[...new Set(linked.map(a=>Number(a.sessionId)).filter(n=>n>0))],officeIds=[...new Set(linked.map(a=>Number(a.officeEventId)).filter(n=>n>0))];
    const conditions=[`s.appointment_id IN (${linked.map(()=>'?').join(',')})`];const params=[agencyId,...linked.map(a=>a.appointmentId)];
    if(sessionIds.length){conditions.push(`s.id IN (${sessionIds.map(()=>'?').join(',')})`);params.push(...sessionIds);}
    if(officeIds.length){conditions.push(`s.office_event_id IN (${officeIds.map(()=>'?').join(',')})`);params.push(...officeIds);}
    [existing]=await d.clinical.execute(`SELECT s.id AS sessionId,s.appointment_id AS appointmentId,s.office_event_id AS officeEventId,s.client_id AS clientId,s.encounter_status AS encounterStatus,EXISTS(SELECT 1 FROM clinical_claims c WHERE c.agency_id=s.agency_id AND c.clinical_session_id=s.id AND c.is_deleted=0) AS hasClaim FROM clinical_sessions s WHERE s.agency_id=? AND (${conditions.join(' OR ')})`,params);
  }
  const items=sessions.map(s=>({...s,key:`session:${s.sessionId}`,source:'clinical_session'}));
  for(const a of appointments){const match=existing.find(s=>Number(s.clientId)===Number(a.clientId)&&((a.appointmentId&&Number(s.appointmentId)===Number(a.appointmentId))||(a.sessionId&&Number(s.sessionId)===Number(a.sessionId))||(a.officeEventId&&Number(s.officeEventId)===Number(a.officeEventId))));
    if(Number(match?.hasClaim)===1 || ['cancelled','canceled','no_show','void','voided','rescheduled'].includes(String(match?.encounterStatus || '').toLowerCase()) || items.some(s=>Number(s.clientId)===Number(a.clientId)&&((a.appointmentId&&Number(s.appointmentId)===Number(a.appointmentId))||(a.sessionId&&Number(s.sessionId)===Number(a.sessionId))||(a.officeEventId&&Number(s.officeEventId)===Number(a.officeEventId)))))continue;
    items.push({...a,sessionId:match?.sessionId || a.sessionId || null,key:`appointment:${a.appointmentId}:${a.clientId}`,source:'appointment',noteId:null,signedAt:null});
  }
  for(const item of items){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(item.serviceDate || '')){
      const raw=item.startAt instanceof Date?item.startAt.toISOString():String(item.startAt || '').replace(' ','T');
      const instant=new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)?raw:`${raw}Z`);
      item.serviceDate=Number.isFinite(instant.getTime())?new Intl.DateTimeFormat('en-CA',{timeZone:item.timeZone || 'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(instant):null;
    }
  }
  items.sort((a,b)=>String(b.serviceDate || b.startAt || '').localeCompare(String(a.serviceDate || a.startAt || '')));
  return {items:items.slice(0,200),hasMore:items.length>200 || appointments.length>200 || sessions.length>200,appointmentsUnavailable:unavailable};
}
