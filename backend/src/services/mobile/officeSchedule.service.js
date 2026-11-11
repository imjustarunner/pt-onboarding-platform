import pool from '../../config/database.js';
import {quickDayWindow} from '../../utils/quickViewCalendar.js';

const id=value=>Number.isSafeInteger(Number(value)) && Number(value)>0?Number(value):0;
const address=row=>[row.street_address,row.city,row.state].filter(Boolean).join(', ');
const officeId=row=>id(row.office_id || row.id);
export function officeReservationLabel(row){
 const state=String(row.slot_state || '').toUpperCase();
 if(state==='ASSIGNED_TEMPORARY')return 'Temporary office reservation';
 if(state==='COMPANY_HOLD')return 'Office hold';
 // An office entitlement/standing assignment is not a booked clinical session.
 return 'Office reservation';
}
export function projectOfficeSchedule({locations=[],myRows=[],rosterRows=[],userId,filterId=null}){
 const uniqueLocations=[...new Map(locations.map(row=>[officeId(row),{...row,id:officeId(row),address:address(row),label:[row.name,address(row)].filter(Boolean).join(' · ')}])).values()];
 const allowed=new Set(uniqueLocations.map(row=>row.id));
 if(filterId && !allowed.has(Number(filterId)))throw Object.assign(new Error('This office is not available in this workspace.'),{status:403});
 const mine=[...new Map(myRows.filter(row=>allowed.has(officeId(row)) && (!filterId || officeId(row)===Number(filterId)) && Number(row.booked_provider_id || row.assigned_provider_id || row.standing_provider_id)===Number(userId)).map(row=>[Number(row.id),{...row,office_id:officeId(row),availability:officeReservationLabel(row),isClinicalAppointment:false}])).values()];
 const byOffice=new Map(),byPerson=new Map(),seen=new Set();
 for(const row of rosterRows){
  const oid=officeId(row),pid=id(row.provider_id),key=`${oid}:${row.event_id}`;
  if(!allowed.has(oid)||!pid||seen.has(key)||filterId&&oid!==Number(filterId))continue;seen.add(key);
  if(!byOffice.has(oid)){const location=uniqueLocations.find(item=>item.id===oid);byOffice.set(oid,{...location,people:[],slotCount:0});}
  const office=byOffice.get(oid);office.slotCount++;
  const pkey=`${oid}:${pid}`;
  if(!byPerson.has(pkey)){const person={providerId:pid,name:String(row.provider_name || '').trim() || 'Staff member',officeId:oid,officeName:office.name,firstStart:row.start_at,lastEnd:row.end_at,rooms:[],slots:[]};byPerson.set(pkey,person);office.people.push(person);}
  const person=byPerson.get(pkey);
  if(row.start_at && (!person.firstStart || new Date(row.start_at)<new Date(person.firstStart)))person.firstStart=row.start_at;
  if(row.end_at && (!person.lastEnd || new Date(row.end_at)>new Date(person.lastEnd)))person.lastEnd=row.end_at;
  const room=String(row.room_number || row.room_name || '').trim();if(room&&!person.rooms.includes(room))person.rooms.push(room);
  person.slots.push({id:row.event_id,startAt:row.start_at,endAt:row.end_at,status:row.status || null,availability:officeReservationLabel(row),room:room || null});
 }
 const offices=[...byOffice.values()].map(row=>({...row,people:row.people.sort((a,b)=>a.name.localeCompare(b.name))}));
 const people=[...new Map([...byPerson.values()].map(row=>[row.providerId,row])).values()].sort((a,b)=>a.name.localeCompare(b.name));
 return {mySlots:mine,slots:mine,locations:uniqueLocations,offices,people};
}
export async function loadOfficeSchedule({userId,agencyId,day,timeZone='America/Denver',officeFilterId=null},db=pool){
 if(!id(userId)||!id(agencyId))throw Object.assign(new Error('Choose an authorized workspace.'),{status:403});
 const {windowStart,windowEnd}=quickDayWindow(day,timeZone);
 const [locations]=await db.execute(`SELECT DISTINCT physical.id,physical.name,physical.street_address,physical.city,physical.state,physical.postal_code,physical.timezone
  FROM office_locations membership JOIN office_locations physical ON physical.id=COALESCE(membership.physical_office_location_id,membership.id)
  WHERE COALESCE(membership.is_active,1)=1 AND COALESCE(physical.is_active,1)=1
  AND (membership.agency_id=? OR EXISTS(SELECT 1 FROM office_location_agencies allowed WHERE allowed.office_location_id=membership.id AND allowed.agency_id=?))
  ORDER BY physical.name,physical.id LIMIT 100`,[agencyId,agencyId]);
 const ids=[...new Set(locations.map(row=>id(row.id)).filter(Boolean))];
 if(officeFilterId&&!ids.includes(Number(officeFilterId)))throw Object.assign(new Error('This office is not available in this workspace.'),{status:403});
 if(!ids.length)return {ok:true,day,timeZone,agencyId,...projectOfficeSchedule({locations,userId})};
 const slots=ids.map(()=>'?').join(','),where=`COALESCE(location.physical_office_location_id,location.id) IN (${slots}) AND e.start_at<? AND e.end_at>? AND UPPER(COALESCE(e.status,'')) NOT IN('CANCELLED','CANCELED','DELETED','RELEASED')`;
 const columns=`e.id,e.start_at,e.end_at,e.status,e.slot_state,e.assigned_provider_id,e.booked_provider_id,sa.provider_id AS standing_provider_id,physical.id AS office_id,physical.name AS office_name,room.name AS room_name,room.room_number`;
 const joins=`FROM office_events e JOIN office_locations location ON location.id=e.office_location_id JOIN office_locations physical ON physical.id=COALESCE(location.physical_office_location_id,location.id) LEFT JOIN office_rooms room ON room.id=e.room_id LEFT JOIN office_standing_assignments sa ON sa.id=e.standing_assignment_id`;
 const [mine,roster]=await Promise.all([
  db.execute(`SELECT ${columns} ${joins} WHERE ${where} AND COALESCE(e.booked_provider_id,e.assigned_provider_id,sa.provider_id)=? ORDER BY e.start_at,e.id LIMIT 200`,[...ids,windowEnd,windowStart,userId]),
  db.execute(`SELECT ${columns},e.id AS event_id,COALESCE(e.booked_provider_id,e.assigned_provider_id,sa.provider_id) AS provider_id,TRIM(CONCAT(COALESCE(person.first_name,''),' ',COALESCE(person.last_name,''))) AS provider_name ${joins} JOIN users person ON person.id=COALESCE(e.booked_provider_id,e.assigned_provider_id,sa.provider_id) WHERE ${where} ORDER BY physical.name,person.first_name,e.start_at,e.id LIMIT 800`,[...ids,windowEnd,windowStart])
 ]);
 return {ok:true,day,timeZone,agencyId,...projectOfficeSchedule({locations,myRows:mine[0],rosterRows:roster[0],userId,filterId:officeFilterId})};
}
