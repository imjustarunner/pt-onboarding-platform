import pool from '../config/database.js';
import Virtual from '../models/ProviderVirtualSlotAvailability.model.js';
import InPerson from '../models/ProviderInPersonSlotAvailability.model.js';
import {availabilityOccursOn} from '../utils/availabilityRecurrence.js';
const utc=value=>value instanceof Date?value:new Date(String(value).replace(' ','T').replace(/(?<!Z)$/,'Z'));
const local=(date,tz,options)=>new Intl.DateTimeFormat('en-CA',{timeZone:tz,...options}).format(utc(date));
export function officePublicationMatches(event,anchor,frequency,timeZone) {
 const date=local(event.start_at,timeZone,{year:'numeric',month:'2-digit',day:'2-digit'});
 const first=local(anchor.start_at,timeZone,{year:'numeric',month:'2-digit',day:'2-digit'});
 const options={hourCycle:'h23',hour:'2-digit',minute:'2-digit'};
 return availabilityOccursOn({frequency,startDate:first},date)
  && local(event.start_at,timeZone,options)===local(anchor.start_at,timeZone,options)
  && +utc(event.end_at)-+utc(event.start_at)===+utc(anchor.end_at)-+utc(anchor.start_at);
}
// Publish only real, assigned room reservations. Cadence never manufactures a room or a client appointment.
export async function publishOfficeAvailability({event,agencyId,providerId,frequency='ONCE',purpose='INTAKE',format,availableForIntake=true,availableForSession=false,actorId}) {
 if(!['ONCE','WEEKLY','BIWEEKLY','EVERY_3_WEEKS','EVERY_4_WEEKS'].includes(frequency))throw Object.assign(new Error('Choose once, weekly, every 2 weeks, or every 4 weeks.'),{status:400});
 purpose=frequency==='ONCE'?(purpose==='MEETING'?'MEETING':'INTAKE'):'ONGOING';
 const conn=await pool.getConnection();
 try {await conn.beginTransaction();
  const [locations]=await conn.execute('SELECT timezone FROM office_locations WHERE id=?',[event.office_location_id]);const timeZone=locations[0]?.timezone||'America/Denver';
  const [events]=await conn.execute(`SELECT e.*,EXISTS(SELECT 1 FROM appointments a WHERE a.office_event_id=e.id) has_appointment
   FROM office_events e WHERE e.office_location_id=? AND e.room_id=? AND e.assigned_provider_id=?
   AND e.start_at>=? AND e.start_at<DATE_ADD(?,INTERVAL 1 YEAR) AND COALESCE(e.status,'')<>'CANCELLED'
   ORDER BY e.start_at FOR UPDATE`,[event.office_location_id,event.room_id,providerId,event.start_at,event.start_at]);
  const candidates=events.filter(e=>officePublicationMatches(e,event,frequency,timeZone));
  const open=candidates.filter(e=>!e.client_id&&!e.clinical_session_id&&!e.billing_context_id&&!Number(e.has_appointment));
  if(!open.some(e=>Number(e.id)===Number(event.id)))throw Object.assign(new Error('This reservation is no longer available to publish.'),{status:409});
  for(const e of open)await (format==='VIRTUAL'?Virtual:InPerson).upsertSlot({database:conn,agencyId,providerId,officeLocationId:e.office_location_id,roomId:e.room_id,startAt:e.start_at,endAt:e.end_at,availableForIntake,availableForSession,frequency,purpose,sourceEventId:e.id,createdByUserId:actorId});
  await conn.commit();return {publishedCount:open.length,skippedAppointments:candidates.length-open.length,publishedThrough:open.at(-1)?.start_at,frequency,purpose};
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
