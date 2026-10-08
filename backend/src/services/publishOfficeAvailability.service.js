import {randomUUID} from 'node:crypto';
import {careTypes as normalizeCareTypes} from '../utils/availabilityCareTypes.js';
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
export async function publishOfficeAvailability({event,agencyId,providerId,frequency='ONCE',purpose='INTAKE',format,availableForIntake=true,availableForSession=false,careTypes=null,actorId,replaceFormats=false}) {
 if(!['IN_PERSON','VIRTUAL',...(replaceFormats?['BOTH','PRIVATE']:[])].includes(format))throw Object.assign(new Error('Choose an appointment format.'),{status:400});
 if(!['ONCE','MONTHLY','WEEKLY','BIWEEKLY','EVERY_3_WEEKS','EVERY_4_WEEKS'].includes(frequency))throw Object.assign(new Error('Choose once, weekly, every 2 weeks, or every 4 weeks.'),{status:400});
 purpose=frequency==='ONCE'?(purpose==='MEETING'?'MEETING':'INTAKE'):'ONGOING';
 const conn=await pool.getConnection();
 try {await conn.beginTransaction();
  if(event.standing_assignment_id){const [[assignment]]=await conn.execute('SELECT provider_id,booking_agency_id,is_active FROM office_standing_assignments WHERE id=? FOR UPDATE',[event.standing_assignment_id]);if(!assignment||!assignment.is_active||Number(assignment.provider_id)!==Number(providerId)||Number(assignment.booking_agency_id)!==Number(agencyId))throw Object.assign(new Error('This reservation changed. Refresh before publishing.'),{status:409});}
  const [locations]=await conn.execute('SELECT timezone FROM office_locations WHERE id=?',[event.office_location_id]);const timeZone=locations[0]?.timezone||'America/Denver';
  const [events]=await conn.execute(`SELECT e.*,EXISTS(SELECT 1 FROM appointments a WHERE a.office_event_id=e.id) has_appointment
   FROM office_events e WHERE e.office_location_id=? AND e.room_id=? AND e.assigned_provider_id=?
   AND e.start_at>=? AND e.start_at<DATE_ADD(?,INTERVAL 1 YEAR) AND COALESCE(e.status,'')<>'CANCELLED'
   ORDER BY e.start_at FOR UPDATE`,[event.office_location_id,event.room_id,providerId,event.start_at,event.start_at]);
  const candidates=events.filter(e=>Number(e.standing_assignment_id||0)===Number(event.standing_assignment_id||0)&&officePublicationMatches(e,event,frequency,timeZone));
  const open=candidates.filter(e=>!e.client_id&&!e.clinical_session_id&&!e.billing_context_id&&!Number(e.has_appointment));
  if(!open.some(e=>Number(e.id)===Number(event.id)))throw Object.assign(new Error('This reservation is no longer available to publish.'),{status:409});
  const seriesId=frequency==='ONCE'&&!replaceFormats?null:randomUUID();
  for(const e of open){
    if(replaceFormats)for(const [kind,table] of [['VIRTUAL','provider_virtual_slot_availability'],['IN_PERSON','provider_in_person_slot_availability']]){
      if(format!==kind&&format!=='BOTH'){
        // An explicit closed occurrence must survive routine materialization;
        // it does not change the provider's other standing reservations.
        const model=kind==='VIRTUAL'?Virtual:InPerson;
        await model.upsertSlot({database:conn,agencyId,providerId,officeLocationId:e.office_location_id,roomId:e.room_id,startAt:e.start_at,endAt:e.end_at,frequency,purpose,seriesId,sourceEventId:e.id,createdByUserId:actorId});
        await conn.execute(`UPDATE ${table} SET is_active=0 WHERE source_event_id=? AND agency_id=? AND provider_id=?`,[e.id,agencyId,providerId]);
      }
    }
    for(const model of format==='PRIVATE'?[]:format==='BOTH'?[Virtual,InPerson]:[format==='VIRTUAL'?Virtual:InPerson])await model.upsertSlot({database:conn,agencyId,providerId,officeLocationId:e.office_location_id,roomId:e.room_id,startAt:e.start_at,endAt:e.end_at,availableForIntake,availableForSession,frequency,purpose,seriesId,careTypes:normalizeCareTypes(careTypes),sourceEventId:e.id,createdByUserId:actorId});
  }
  await conn.commit();return {publishedCount:open.length,skippedAppointments:candidates.length-open.length,publishedThrough:open.at(-1)?.start_at,frequency,purpose};
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
