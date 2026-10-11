import pool from '../../config/database.js';
import {clientAccess} from './access.js';
import {fail,positiveId} from './template.js';
export async function appointmentPrefill(user,{eventType,eventId,agencyId,clientId}={}){
 if(!eventId)return null;
 if(!['office','provider'].includes(eventType))fail(400,'Select an office or provider appointment.');
 const sql=eventType==='office'?'SELECT e.*,o.name AS location_name,o.timezone AS event_timezone FROM office_events e JOIN office_locations o ON o.id=e.office_location_id WHERE e.id=?':'SELECT * FROM provider_schedule_events WHERE id=?';
 const [[event]]=await pool.execute(sql,[positiveId(eventId)]);
 if(!event?.client_id)fail(404,'This appointment has no linked client. Open the client record to prepare the letter.');
 const client=await clientAccess(user,event.client_id,{write:true});
 if(Number(client.agency_id)!==Number(agencyId)||(clientId&&Number(clientId)!==Number(client.id)))fail(403,'The appointment and client must belong to the current organization.');
 if(['CANCELLED','CANCELED','RELEASED','NO_SHOW','NOSHOW'].includes(String(event.status).toUpperCase()))fail(409,'A cancelled or missed appointment cannot verify attendance.');
 const zone=event.event_timezone||'America/Denver';
 const parse=v=>v instanceof Date?v:new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(String(v))?v:String(v).replace(' ','T')+'Z');
 const start=parse(event.start_at),end=parse(event.end_at);if(!Number.isFinite(+start)||!Number.isFinite(+end))fail(400,'The appointment needs a valid start and end time.');
 const fmt=(d,options)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,...options}).format(d);
 return {client:{id:client.id,name:client.full_name||client.initials||'',agencyId:client.agency_id},source:{eventType,eventId:Number(eventId),startAt:start.toISOString(),endAt:end.toISOString()},data:{personLabel:client.full_name||client.initials||'',appointmentDate:fmt(start,{year:'numeric',month:'2-digit',day:'2-digit'}),startTime:fmt(start,{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}),endTime:fmt(end,{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}),timezone:zone,location:event.location_name||'Verify appointment location or virtual visit',attendanceStatus:'Not yet confirmed',issuerName:`${user.first_name||''} ${user.last_name||''}`.trim(),excuseRequested:'Yes'}};
}
