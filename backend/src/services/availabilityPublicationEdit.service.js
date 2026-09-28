import {wallMysqlToUtcMysql} from '../utils/zonedWallTime.util.js';
import {officePublicationMatches} from './publishOfficeAvailability.service.js';
import pool from '../config/database.js';
import {availabilityOccursOn} from '../utils/availabilityRecurrence.js';
import {careTypes} from '../utils/availabilityCareTypes.js';
import {addDaysYmd} from '../utils/scheduleRecurrence.js';
import {randomUUID} from 'node:crypto';
const tables={weekly:'provider_virtual_working_hours',virtual:'provider_virtual_slot_availability',inPerson:'provider_in_person_slot_availability'};
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const json=(v,fallback)=>{try{return typeof v==='string'?JSON.parse(v):v??fallback;}catch{return fallback;}};
const day=d=>['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(d+'T12:00:00Z').getUTCDay()];
const date=value=>{const d=String(value||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||isNaN(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d)throw fail('Choose a valid occurrence date.');return d;};
const time=v=>{if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v||''))throw fail('Choose valid start and end times.');return v;};
export function planWeeklyEdit(row,{action,scope,occurrenceDate,startDate,startTime,endTime,careTypes:care,availableForIntake,availableForSession}) {
 if(!['delete','move'].includes(action)||!['single','future'].includes(scope))throw fail('Choose this occurrence or this and future occurrences.');
 const on=date(occurrenceDate),start=String(row.start_date||'').slice(0,10),end=String(row.end_date||'').slice(0,10);
 if(day(on)!==row.day_of_week||!availabilityOccursOn(row,on))throw fail('That date is not an occurrence of this opening.',409);
 let excluded=json(row.excluded_dates_json,[]),replacement=null;
 if(action==='move') {
  const to=date(startDate),s=time(startTime),e=time(endTime);if(e<=s)throw fail('End time must follow start time.');
  replacement={...row,day_of_week:day(to),start_date:to,start_time:s,end_time:e,
   end_date:scope==='single'||row.frequency==='ONCE'?to:end?addDaysYmd(end,Math.round((Date.parse(to)-Date.parse(on))/86400000)):null,
   frequency:scope==='single'?'ONCE':row.frequency,
   excluded_dates_json:scope==='single'?[]:excluded.filter(d=>d>=on).map(d=>addDaysYmd(d,Math.round((Date.parse(to)-Date.parse(on))/86400000))),
   available_for_intake:typeof availableForIntake==='boolean'?Number(availableForIntake):row.available_for_intake,
   available_for_session:typeof availableForSession==='boolean'?Number(availableForSession):row.available_for_session,
   care_types_json:care===undefined?careTypes(row.care_types_json):careTypes(care)};
  if(!replacement.available_for_intake&&!replacement.available_for_session)throw fail('Choose new clients, current clients, or both.');
  replacement.session_type=replacement.available_for_intake?(replacement.available_for_session?'BOTH':'INTAKE'):'REGULAR';
  if(care!=null&&(!Array.isArray(care)||!replacement.care_types_json?.length))throw fail('Choose at least one care type.');
 }
 if(scope==='single')excluded=[...new Set([...excluded,on])];
 return {excludedDates:excluded,endDate:scope==='future'?addDaysYmd(on,-1):end||null,replacement,removeOriginal:row.frequency==='ONCE'||scope==='future'&&start&&on<=start};
}
async function insertHours(db,r,agencyId,providerId){
 await db.execute(`INSERT INTO provider_virtual_working_hours (agency_id,provider_id,day_of_week,start_time,end_time,session_type,available_for_intake,available_for_session,frequency,start_date,end_date,purpose,excluded_dates_json,care_types_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
 [agencyId,providerId,r.day_of_week,r.start_time,r.end_time,r.session_type,r.available_for_intake,r.available_for_session,r.frequency,r.start_date,r.end_date||null,r.purpose,JSON.stringify(r.excluded_dates_json||[]),r.care_types_json===null?null:JSON.stringify(r.care_types_json)]);
}
export async function editAvailabilityPublication({agencyId,providerId,kind,id,...options},database=pool){
 const table=tables[kind];if(!table||!Number.isSafeInteger(id)||id<1)throw fail('Invalid published availability.');
 const db=await database.getConnection();try{await db.beginTransaction();
 const [rows]=await db.execute(`SELECT *,DATE_FORMAT(${kind==='weekly'?'start_date':'start_at'},'%Y-%m-%d') occurrence_date ${kind==='weekly'?",DATE_FORMAT(start_date,'%Y-%m-%d') start_date,DATE_FORMAT(end_date,'%Y-%m-%d') end_date":''} FROM ${table} WHERE id=? AND agency_id=? AND provider_id=? ${kind==='weekly'?'':'AND is_active=1'} FOR UPDATE`,[id,agencyId,providerId]);
 const row=rows[0];if(!row)throw fail('Opening no longer exists. Refresh the schedule.',404);
 if(kind==='weekly'){
  const plan=planWeeklyEdit(row,options);
  if(plan.removeOriginal)await db.execute(`DELETE FROM ${table} WHERE id=?`,[id]);
  else await db.execute(`UPDATE ${table} SET end_date=?,excluded_dates_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,[plan.endDate,JSON.stringify(plan.excludedDates),id]);
  if(plan.replacement)await insertHours(db,plan.replacement,agencyId,providerId);
 }else{
  if(!['single','future'].includes(options.scope)||!['delete','move'].includes(options.action))throw fail('Choose an edit scope.');
  let linked=[row];
  if(options.scope==='future'&&row.series_id){const [siblings]=await db.execute(`SELECT * FROM ${table} WHERE agency_id=? AND provider_id=? AND series_id=? AND start_at>=? AND is_active=1 ORDER BY start_at FOR UPDATE`,[agencyId,providerId,row.series_id,row.start_at]);linked=siblings;}
  if(options.scope==='future'&&!row.series_id&&row.frequency!=='ONCE'){
   const [sources]=await db.execute('SELECT standing_assignment_id,recurrence_group_id FROM office_events WHERE id=?',[row.source_event_id]);const source=sources[0];
   if(source?.standing_assignment_id||source?.recurrence_group_id){
    const [siblings]=await db.execute(`SELECT p.* FROM ${table} p JOIN office_events e ON e.id=p.source_event_id WHERE p.agency_id=? AND p.provider_id=? AND p.office_location_id=? AND p.room_id=? AND p.frequency=? AND p.series_id IS NULL AND p.start_at>=? AND p.is_active=1 AND ${source.standing_assignment_id?'e.standing_assignment_id=?':'e.recurrence_group_id=?'} FOR UPDATE`,[agencyId,providerId,row.office_location_id,row.room_id,row.frequency,row.start_at,source.standing_assignment_id||source.recurrence_group_id]);
    const [locations]=await db.execute('SELECT timezone FROM office_locations WHERE id=?',[row.office_location_id]);
    linked=siblings.filter(r=>officePublicationMatches(r,row,row.frequency,locations[0]?.timezone||'America/Denver'));
   }
  }
  if(options.action==='delete')for(const r of linked)await db.execute(`UPDATE ${table} SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`,[r.id]);
  else {
   // Room-backed publications can only move onto an actual available reservation.
   // Use wall-clock differences so future dates stay aligned across DST.
   const [{default:Availability},{default:Virtual},{default:InPerson}]=await Promise.all([import('./providerAvailability.service.js'),import('../models/ProviderVirtualSlotAvailability.model.js'),import('../models/ProviderInPersonSlotAvailability.model.js')]);
   const [locations]=await db.execute('SELECT timezone FROM office_locations WHERE id=?',[row.office_location_id]);
   const tz=locations[0]?.timezone||await Availability.resolveAgencyTimeZone({agencyId});
   const utc=v=>v instanceof Date?v:new Date(String(v).replace(' ','T')+'Z');
   const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'});
   const originalDate=fmt.format(utc(row.start_at)),target=date(options.startDate),s=time(options.startTime),e=time(options.endTime);if(e<=s)throw fail('End time must follow start time.');
   const delta=Math.round((Date.parse(target)-Date.parse(originalDate))/86400000),series=options.scope==='future'?randomUUID():null;
   const moves=[];
   const selectedIds=new Set(linked.map(r=>Number(r.id)));
   const normalizedCare=options.careTypes===undefined?undefined:careTypes(options.careTypes);
   if(options.careTypes!=null&&!normalizedCare?.length)throw fail('Choose at least one care type.');
   for(const r of linked){
    const targetDate=addDaysYmd(fmt.format(utc(r.start_at)),delta);
    const [targets]=await db.execute(`SELECT ev.* FROM office_events ev JOIN office_locations loc ON loc.id=ev.office_location_id WHERE ev.office_location_id=? AND ev.room_id=? AND ev.assigned_provider_id=? AND ev.status<>'CANCELLED'
     AND ev.start_at=? AND ev.end_at=?
     AND ev.client_id IS NULL AND ev.clinical_session_id IS NULL AND ev.billing_context_id IS NULL AND NOT EXISTS(SELECT 1 FROM appointments a WHERE a.office_event_id=ev.id) FOR UPDATE`,[r.office_location_id,r.room_id,providerId,wallMysqlToUtcMysql(targetDate+' '+s+':00',tz),wallMysqlToUtcMysql(targetDate+' '+e+':00',tz)]);
    if(!targets.length)throw fail('Reserve the target office time first. No openings were moved because a target reservation is missing or has an appointment.',409);
    const t=targets[0];
    const [existing]=await db.execute(`SELECT id FROM ${table} WHERE agency_id=? AND provider_id=? AND start_at=? AND end_at=? AND is_active=1 FOR UPDATE`,[agencyId,providerId,t.start_at,t.end_at]);
    if(existing.some(p=>!selectedIds.has(Number(p.id))))throw fail('The target already has a published opening. No openings were moved.',409);
    moves.push({original:r,target:t});
   }
   // Deactivate the entire selection before upserts: a shifted occurrence can
   // reuse another selected occurrence's date without being erased afterwards.
   for(const r of linked)await db.execute(`UPDATE ${table} SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`,[r.id]);
   for(const {original:r,target:t} of moves)await (kind==='virtual'?Virtual:InPerson).upsertSlot({database:db,agencyId,providerId,officeLocationId:t.office_location_id,roomId:t.room_id,startAt:t.start_at,endAt:t.end_at,sourceEventId:t.id,availableForIntake:!!r.available_for_intake,availableForSession:!!r.available_for_session,frequency:options.scope==='single'?'ONCE':r.frequency,purpose:r.purpose,seriesId:series,careTypes:normalizedCare===undefined?careTypes(r.care_types_json):normalizedCare});
  }
 }
 await db.commit();return {ok:true};
 }catch(e){await db.rollback();throw e;}finally{db.release();}
}
