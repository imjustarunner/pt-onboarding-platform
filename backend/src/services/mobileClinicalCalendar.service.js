import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import {authorizedMobileClientCards} from './mobileClinicalPrivacy.service.js';
import {utcMysqlToIso} from '../utils/zonedWallTime.util.js';

export async function enrichMobileClinicalCalendar({user,agencyId,windowStart,windowEnd,items,events}) {
 const [appointments]=await pool.execute(`SELECT a.id,a.clinical_session_id,a.office_event_id,a.provider_schedule_event_id,a.start_at,a.end_at,a.status,a.location_label,a.service_code,a.source_timezone,p.client_id
  FROM appointments a JOIN appointment_participants p ON p.appointment_id=a.id AND p.client_id IS NOT NULL
  WHERE a.agency_id=? AND a.provider_user_id=? AND a.start_at<? AND a.end_at>?
  AND a.status IN ('scheduled','confirmed','client_confirmed','checked_in','completed') ORDER BY a.start_at,a.id,p.client_id`,[agencyId,user.id,windowEnd,windowStart]);
 const ids=[...appointments.map(a=>a.client_id),...events.filter(e=>Number(e.agency_id)===Number(agencyId)).map(e=>e.client_id || e.clientId)].filter(Boolean);
 const cards=await authorizedMobileClientCards(user,agencyId,ids);
 const appointmentIds=[...new Set(appointments.map(a=>Number(a.id)))];
 const [sessions]=appointmentIds.length?await clinicalPool.execute(`SELECT id,client_id,appointment_id,source_timezone FROM clinical_sessions WHERE agency_id=? AND provider_user_id=? AND appointment_id IN (${appointmentIds.map(()=>'?').join(',')})`,[agencyId,user.id,...appointmentIds]):[[]];
 const pseIds=new Set(appointments.map(a=>Number(a.provider_schedule_event_id)).filter(Boolean));
 const officeIds=new Set(appointments.map(a=>Number(a.office_event_id)).filter(Boolean));
 const result=items.filter(item=>!(String(item.id).startsWith('pse-') && pseIds.has(Number(item.eventId))) && !(String(item.id).startsWith('office-') && officeIds.has(Number(item.eventId)))).map(item=>{
  if(!item.hasClient)return item;
  const event=events.find(e=>Number(e.agency_id)===Number(agencyId)&&String(item.id)===`pse-${e.id}`);
  if(!event)return item;
  const card=cards.get(Number(event.client_id || event.clientId));
  return {...item,clientInitials:card?.maskedName || 'Client',clientMaskedName:card?.maskedName || 'Client',clientAge:card?.age ?? null,clientId:card?.id || null,
   clinicalSessionId:null,officeEventId:null,notes:null};
 });
 for(const appointment of appointments) {
  const card=cards.get(Number(appointment.client_id));if(!card)continue;
  const session=sessions.find(s=>Number(s.appointment_id)===Number(appointment.id) && Number(s.client_id)===Number(appointment.client_id));
  result.push({id:`appointment-${appointment.id}-${card.id}`,agencyId:Number(agencyId),eventId:appointment.id,appointmentId:appointment.id,title:'Client session',kind:'CLIENT_SESSION',
   startAt:utcMysqlToIso(appointment.start_at),endAt:utcMysqlToIso(appointment.end_at),status:appointment.status,
   location:appointment.location_label || null,hasClient:true,clientId:card.id,clientInitials:card.maskedName,clientMaskedName:card.maskedName,clientAge:card.age,
   clinicalSessionId:Number(session?.id) || null,officeEventId:Number(appointment.office_event_id) || null,serviceCode:appointment.service_code,
   sourceTimezone:session?.source_timezone || appointment.source_timezone || 'America/Denver',canJoin:false,joinUrl:null,allDay:false,attendees:[],notes:null,editable:false});
 }
 return result.sort((a,b)=>new Date(a.startAt)-new Date(b.startAt));
}
