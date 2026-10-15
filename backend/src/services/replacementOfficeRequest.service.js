import { utcDateToZonedParts, wallMysqlToUtcMysql } from '../utils/zonedWallTime.util.js';
const pad=n=>String(n).padStart(2,'0');
export function oneTimeRoomWindow(start,end,zone){
  const s=utcDateToZonedParts(start,zone),e=utcDateToZonedParts(end,zone);
  const date=`${s.year}-${pad(s.month)}-${pad(s.day)}`,endDate=`${e.year}-${pad(e.month)}-${pad(e.day)}`;
  const nextDate=new Date(+new Date(`${date}T00:00:00Z`)+86400000).toISOString().slice(0,10);
  const endsAtMidnight=endDate===nextDate && e.hour===0 && e.minute===0 && e.second===0;
  if(date!==endDate && !endsAtMidnight)return null;
  const startHour=s.hour,endHour=endsAtMidnight?24:e.hour+(e.minute||e.second?1:0);
  if(endHour<=startHour||endHour>24)return null;
  const begin=wallMysqlToUtcMysql(`${date} ${pad(startHour)}:00:00`,zone);
  const finish=endHour===24 ? `${nextDate} 00:00:00` : `${date} ${pad(endHour)}:00:00`;
  return {date,weekday:new Date(`${date}T12:00:00Z`).getUTCDay(),startHour,endHour,startAt:begin,endAt:wallMysqlToUtcMysql(finish,zone),
    windowLabel:`${date} ${pad(startHour)}:00–${pad(endHour)}:00 (${zone}), one time only`};
}
export async function oneTimeReplacementRoomOptions(appointment,start,end){
  const OfficeLocation=(await import('../models/OfficeLocation.model.js')).default;
  const OfficeRoom=(await import('../models/OfficeRoom.model.js')).default;
  const {isRoomOpenAt}=await import('../controllers/officeSchedule.controller.js');
  const offices=await OfficeLocation.findByAgencyMembership(appointment.agencyId,{physicalOnly:true});
  const result=[];
  for(const office of offices){
    const zone=office.timezone||appointment.sourceTimezone||'America/Denver';
    const window=oneTimeRoomWindow(start,end,zone);if(!window)continue;
    for(const room of await OfficeRoom.findByLocation(office.id)){
      if(room.is_active===false||room.is_active===0)continue;
      if(!await isRoomOpenAt({officeLocationId:office.id,roomId:room.id,startAt:window.startAt,endAt:window.endAt,officeTimeZone:zone}))continue;
      result.push({id:Number(room.id),buildingId:Number(office.id),label:`${office.name} · ${room.room_number?`#${room.room_number}`:room.label||room.name}`,
        needsRequest:true,...window});
    }
  }
  return result;
}
